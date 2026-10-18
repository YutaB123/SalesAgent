"""Local communications sidecar. Owns calls and audio routing, not STT or storage."""
import asyncio
from datetime import timedelta
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import signal
import threading
import time
from urllib.parse import parse_qs, urlsplit

import photon

ROOT = Path(__file__).resolve().parent.parent
for line in (ROOT / '.env').read_text().splitlines() if (ROOT / '.env').exists() else []:
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('\"\''))
ROOM = os.environ.get('LIVEKIT_ROOM', 'salesagent-demo')
LOCK = threading.Lock()
READY = False
SELLER_READY = False
CURRENT = None
EVENTS = []
SEQUENCE = 0


def emit(kind, **fields):
    global SEQUENCE
    with LOCK:
        SEQUENCE += 1
        event = dict(id=SEQUENCE, eventId=secrets.token_hex(16), type=kind, timestamp=time.time(), room=ROOM, **fields)
        EVENTS.append(event)
        del EVENTS[:-500]


def token(role):
    from livekit import api
    seller = role == 'rep'
    return (api.AccessToken(os.environ['LIVEKIT_API_KEY'], os.environ['LIVEKIT_API_SECRET'])
            .with_identity('seller-browser' if seller else 'transcriber-' + secrets.token_hex(6))
            .with_name('Salesperson' if seller else 'Transcriber')
            .with_attributes({'role': role}).with_ttl(timedelta(minutes=15))
            .with_grants(api.VideoGrants(room_join=True, room=ROOM,
                can_publish=seller, can_subscribe=True, can_publish_data=False,
                can_publish_sources=['microphone'] if seller else [],
                can_update_own_metadata=False)).to_jwt())


def set_call(call_id, state, **fields):
    with LOCK:
        if not CURRENT or CURRENT['callId'] != call_id:
            return
        if CURRENT['state'] in ('ended', 'failed'):
            return
        CURRENT.update(state=state, **fields)
    emit('call.' + state, callId=call_id, **fields)


# If the salesperson's browser drops out of the room, do not hang up on the customer at once. A second tab, a page
# reload or a network blip replaces or restarts the browser session within seconds. Only hang up if nobody comes back.
SELLER_GRACE_SECONDS = float(os.environ.get('SELLER_GRACE_SECONDS', '15'))


async def hang_up_if_seller_stays_gone(call_id, seller_present, delay=None):
    await asyncio.sleep(SELLER_GRACE_SECONDS if delay is None else delay)
    if seller_present():
        emit('seller.reconnected', callId=call_id)   # the call carries on
        return False
    with LOCK:
        call = dict(CURRENT) if CURRENT else None
    if not call or call['callId'] != call_id or call['state'] in ('ended', 'failed'):
        return False
    set_call(call_id, 'ended')
    await photon.hangup(call['participant'])
    return True


def dial_worker(recipient, call_id):
    identity = 'outbound-' + call_id
    async def run():
        try:
            await photon.dial(recipient, identity=identity)
            with LOCK:
                cancelled = not CURRENT or CURRENT['callId'] != call_id or CURRENT['state'] == 'ended'
            if cancelled:
                await photon.hangup(identity)
            else:
                set_call(call_id, 'answered')
        except ValueError as exc:
            set_call(call_id, 'failed', error=str(exc))
        except Exception:
            set_call(call_id, 'failed', error='Provider call failed. Check Photon/LiveKit logs.')
    asyncio.run(run())


def begin_call(recipient):
    global CURRENT
    recipient = photon.phone(recipient)
    if not READY or not SELLER_READY:
        raise ValueError('Connect the salesperson microphone before dialing.')
    if recipient == os.environ.get('PHOTON_PHONE_NUMBER'):
        raise ValueError('Recipient must differ from your Photon caller ID.')
    with LOCK:
        if CURRENT and CURRENT['state'] not in ('ended', 'failed'):
            raise ValueError('End the current call before starting another.')
        call_id = secrets.token_hex(16)
        CURRENT = dict(callId=call_id, participant='outbound-' + call_id, state='dialing')
    emit('call.dialing', callId=call_id)
    threading.Thread(target=dial_worker, args=(recipient, call_id), daemon=True).start()
    return dict(callId=call_id, state='dialing')


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, data):
        raw = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(raw)

    def authorized(self):
        secret = os.environ.get('COMMUNICATIONS_SERVICE_TOKEN', '')
        if secret and hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + secret):
            return True
        self.reply(401, dict(error='Communications service authentication required.'))
        return False

    def do_GET(self):
        if not self.authorized():
            return
        request = urlsplit(self.path)
        if request.path == '/state':
            with LOCK:
                call = dict(CURRENT) if CURRENT else None
            return self.reply(200, dict(ready=READY, sellerReady=SELLER_READY, room=ROOM,
                callerId=os.environ.get('PHOTON_PHONE_NUMBER', ''), call=call,
                messaging=photon.availability()['messagingConfigured']))
        if request.path == '/events':
            try:
                after = int(parse_qs(request.query).get('after', ['0'])[0])
            except ValueError:
                return self.reply(400, dict(error='after must be an integer'))
            with LOCK:
                events = [dict(event) for event in EVENTS if event['id'] > after]
                cursor = SEQUENCE
                gap = bool(EVENTS and after and after < EVENTS[0]['id'] - 1)
            return self.reply(200, dict(events=events, cursor=cursor, gap=gap))
        self.reply(404, dict(error='Not found'))

    def do_POST(self):
        if not self.authorized():
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 0 or length > 16384:
                return self.reply(413, dict(error='Request too large'))
            data = json.loads(self.rfile.read(length) or b'{}')
            if not isinstance(data, dict):
                raise ValueError('Expected a JSON object')
            path = urlsplit(self.path).path
            if path in ('/seller-token', '/transcriber-token'):
                if not READY:
                    raise ValueError('Communications room is connecting. Try again shortly.')
                role = 'rep' if path == '/seller-token' else 'transcriber'
                return self.reply(200, dict(url=os.environ['LIVEKIT_URL'], token=token(role), room=ROOM, role=role))
            if path == '/dial':
                return self.reply(202, begin_call(data.get('recipient')))
            if path == '/hangup':
                with LOCK:
                    call = dict(CURRENT) if CURRENT else None
                if not call or call['state'] in ('ended', 'failed'):
                    return self.reply(200, dict(state='ended'))
                if data.get('callId') != call['callId']:
                    raise ValueError('callId must match the active call')
                set_call(call['callId'], 'ending')
                try:
                    asyncio.run(photon.hangup(call['participant']))
                except Exception:
                    with LOCK:
                        if CURRENT and CURRENT['callId'] == call['callId'] and CURRENT['state'] == 'ending':
                            CURRENT['state'] = call['state']
                    raise
                set_call(call['callId'], 'ended')
                return self.reply(200, dict(callId=call['callId'], state='ended'))
            if path == '/followup':
                return self.reply(202, photon.send_followup(data.get('recipient'), data.get('text'), data.get('requestId')))
            self.reply(404, dict(error='Not found'))
        except (ValueError, TypeError, UnicodeError) as exc:
            self.reply(400, dict(error=str(exc)))
        except Exception:
            self.reply(502, dict(error='Provider operation failed. Inspect provider logs.'))


async def main():
    global READY, SELLER_READY
    from livekit import api, rtc
    photon.require('LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'COMMUNICATIONS_SERVICE_TOKEN')
    http = ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('COMMUNICATIONS_PORT', '8787'))), Handler)
    threading.Thread(target=http.serve_forever, daemon=True).start()
    room = rtc.Room()
    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            asyncio.get_running_loop().add_signal_handler(sig, stop.set)
        except NotImplementedError:
            pass   # Windows has no asyncio signal handlers; Ctrl+C still stops the service

    def seller_state():
        global SELLER_READY
        SELLER_READY = any(p.identity == 'seller-browser' and any(
            pub.kind == rtc.TrackKind.KIND_AUDIO for pub in p.track_publications.values())
            for p in room.remote_participants.values())

    @room.on('participant_connected')
    def connected(participant):
        emit('participant.joined', participant=participant.identity,
             role='rep' if participant.identity == 'seller-browser' else 'customer' if participant.identity.startswith('outbound-') else 'observer')
        seller_state()

    @room.on('track_published')
    def published(publication, participant):
        seller_state()

    @room.on('track_unpublished')
    def unpublished(publication, participant):
        seller_state()

    @room.on('participant_attributes_changed')
    def attributes(changed, participant):
        if participant.identity.startswith('outbound-') and 'sip.callStatus' in changed:
            emit('call.sip_status', callId=participant.identity.removeprefix('outbound-'), status=changed['sip.callStatus'])

    @room.on('participant_disconnected')
    def disconnected(participant):
        seller_state()
        # Diagnostic: why did they leave? Only the reason is recorded, never a phone number.
        emit('participant.left', participant=participant.identity, reason=str(getattr(participant, 'disconnect_reason', 'unknown')))
        if participant.identity.startswith('outbound-'):
            set_call(participant.identity.removeprefix('outbound-'), 'ended')
        if participant.identity == 'seller-browser':
            emit('seller.disconnected')
            with LOCK:
                call = dict(CURRENT) if CURRENT else None
            if call and call['state'] not in ('ended', 'failed'):
                asyncio.create_task(hang_up_if_seller_stays_gone(
                    call['callId'], lambda: any(p.identity == 'seller-browser' for p in room.remote_participants.values())))

    @room.on('disconnected')
    def room_disconnected(*args):
        global READY, SELLER_READY
        READY = SELLER_READY = False
        stop.set()

    observer_token = (api.AccessToken(os.environ['LIVEKIT_API_KEY'], os.environ['LIVEKIT_API_SECRET'])
        .with_identity('communications-observer-' + secrets.token_hex(4))
        .with_grants(api.VideoGrants(room_join=True, room=ROOM, can_publish=False, can_subscribe=False, can_publish_data=False)).to_jwt())
    try:
        await room.connect(os.environ['LIVEKIT_URL'], observer_token, options=rtc.RoomOptions(auto_subscribe=False))
        READY = True
        seller_state()
        emit('service.ready')
        print('Communications ready. No transcription or database writes. No call placed.', flush=True)
        await stop.wait()
    finally:
        READY = SELLER_READY = False
        await room.disconnect()
        http.shutdown()
        http.server_close()


if __name__ == '__main__':
    asyncio.run(main())
