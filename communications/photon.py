"""Photon v2 messaging and LiveKit outbound calls. No actions at import time."""
import asyncio
import json
import os
import re
import socket
import uuid
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def require(*names):
    missing = [name for name in names if not os.environ.get(name)]
    if missing:
        raise ValueError('Fill these fields in .env and restart: ' + ', '.join(missing))


def phone(value):
    if not isinstance(value, str) or not re.fullmatch(r'\+[1-9]\d{7,14}', value):
        raise ValueError('Use a phone number with country code, for example +12065550123.')
    return value


def availability():
    routing_ready = bool(os.environ.get('LIVEKIT_OUTBOUND_TRUNK_ID')) or all(os.environ.get(k) for k in (
        'PHOTON_SIP_ADDRESS', 'PHOTON_SIP_USERNAME', 'PHOTON_SIP_PASSWORD', 'PHOTON_PHONE_NUMBER'))
    return {
        'outboundConfigured': all(os.environ.get(k) for k in (
            'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET')) and routing_ready,
        'messagingConfigured': all(os.environ.get(k) for k in (
            'PHOTON_API_KEY', 'PHOTON_PROJECT_ID', 'PHOTON_AGENT_USER_ID')),
        'platform': os.environ.get('PHOTON_MESSAGE_PLATFORM', 'sms'),
    }


def photon_post(path, body, key):
    require('PHOTON_API_KEY', 'PHOTON_PROJECT_ID')
    project = os.environ['PHOTON_PROJECT_ID']
    if not re.fullmatch(r'pho_prj_[0-7][0-9a-hjkmnp-tv-z]{25}', project):
        raise ValueError('PHOTON_PROJECT_ID must be a Photon v2 project ID.')
    request = Request('https://api.photon.codes/v1/projects/' + project + path,
                      data=json.dumps(body).encode(), method='POST', headers={
                          'Authorization': 'Bearer ' + os.environ['PHOTON_API_KEY'],
                          'User-Agent': 'Callside/1.0', 'Accept': 'application/json',
                          'Content-Type': 'application/json', 'idempotency-key': key})
    try:
        with urlopen(request, timeout=20) as response:
            return json.load(response)
    except HTTPError as exc:
        # Never reflect provider response bodies, which may contain private data.
        raise ValueError(f'Photon rejected the request (HTTP {exc.code}). Check API Activities, sender eligibility and channel setup.') from None
    except (URLError, TimeoutError, socket.timeout):
        raise ValueError('Photon response unavailable. Delivery may be pending; retry the unchanged message to reuse its request ID.') from None


def send_followup(recipient, text, request_id):
    require('PHOTON_AGENT_USER_ID')
    recipient = phone(recipient)
    if not isinstance(text, str) or not text.strip() or len(text) > 4000:
        raise ValueError('Enter a message of 1–4000 characters.')
    if not isinstance(request_id, str) or not re.fullmatch(r'[a-zA-Z0-9-]{16,80}', request_id):
        raise ValueError('A valid message request ID is required.')
    platform = os.environ.get('PHOTON_MESSAGE_PLATFORM', 'sms')
    if platform not in ('sms', 'imessage'):
        raise ValueError('PHOTON_MESSAGE_PLATFORM must be sms or imessage.')
    sender = os.environ['PHOTON_AGENT_USER_ID']
    peer = photon_post('/users', {'platform': platform, 'handle': recipient}, request_id + '-user')
    space = photon_post('/spaces', {'platform': platform, 'participantIds': [sender, peer['id']]}, request_id + '-space')
    message = photon_post('/messages', {
        'spaceId': space['id'], 'senderId': sender,
        'content': {'type': 'text', 'format': 'plain', 'text': text.strip()},
    }, request_id + '-message')
    return {'id': message['id'], 'status': message.get('status', 'accepted'),
            'text': 'Accepted by Photon; acceptance does not confirm delivery.'}


async def dial(recipient, identity=None):
    from livekit import api
    require('LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET')
    recipient = phone(recipient)
    if recipient == os.environ.get('PHOTON_PHONE_NUMBER'):
        raise ValueError('Use a separate test phone, not your Photon number.')
    direct_fields = ('PHOTON_SIP_ADDRESS', 'PHOTON_SIP_USERNAME', 'PHOTON_SIP_PASSWORD', 'PHOTON_PHONE_NUMBER')
    if all(os.environ.get(k) for k in direct_fields):
        routing = dict(trunk=api.SIPOutboundConfig(
            hostname=os.environ['PHOTON_SIP_ADDRESS'], transport=api.SIP_TRANSPORT_TLS,
            auth_username=os.environ['PHOTON_SIP_USERNAME'], auth_password=os.environ['PHOTON_SIP_PASSWORD']),
            sip_number=phone(os.environ['PHOTON_PHONE_NUMBER']))
    else:
        require('LIVEKIT_OUTBOUND_TRUNK_ID')
        routing = dict(sip_trunk_id=os.environ['LIVEKIT_OUTBOUND_TRUNK_ID'])
    async with api.LiveKitAPI() as client:
        try:
            result = await client.sip.create_sip_participant(api.CreateSIPParticipantRequest(
                **routing, sip_call_to=recipient,
                room_name=os.environ.get('LIVEKIT_ROOM', 'photon-demo'),
                participant_identity=identity or 'outbound-' + uuid.uuid4().hex,
                participant_name='Outbound caller', wait_until_answered=True,
                ringing_timeout={'seconds': 30}, max_call_duration={'seconds': 600}))
        except api.TwirpError as exc:
            code = (exc.metadata or {}).get('sip_status_code', '')
            if str(code).isdigit():
                raise ValueError('Call did not connect. SIP status ' + str(code) + '. Check Photon voice call logs.') from None
            raise ValueError('Call did not connect. Check LiveKit and Photon call logs.') from None
    return {'participant': result.participant_identity, 'text': 'Call answered.'}


async def hangup(identity):
    from livekit import api
    if not isinstance(identity, str) or not re.fullmatch(r'outbound-[a-f0-9]{32}', identity):
        raise ValueError('Select an outbound call created by this app.')
    async with api.LiveKitAPI() as client:
        try:
            await client.room.remove_participant(api.RoomParticipantIdentity(
                room=os.environ.get('LIVEKIT_ROOM', 'photon-demo'), identity=identity))
        except api.TwirpError as exc:
            if exc.code != 'not_found':
                raise
    return {'text': 'Outbound participant disconnected.'}
