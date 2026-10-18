import os
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch
sys.path.insert(0, os.path.dirname(__file__))
import service

class CommunicationsTests(unittest.TestCase):
    def setUp(self):
        service.CURRENT = None
        service.EVENTS.clear()
        service.SEQUENCE = 0

    def test_requires_microphone_before_dial(self):
        with patch.object(service, 'READY', True), patch.object(service, 'SELLER_READY', False):
            with self.assertRaisesRegex(ValueError, 'microphone'):
                service.begin_call('+14255550123')

    def test_one_call_and_stable_identity(self):
        with patch.object(service, 'READY', True), patch.object(service, 'SELLER_READY', True), patch.object(service.threading, 'Thread'):
            call = service.begin_call('+14255550123')
            self.assertEqual(service.CURRENT['participant'], 'outbound-' + call['callId'])
            self.assertEqual(service.EVENTS[0]['callId'], call['callId'])
            self.assertNotIn('recipient', service.EVENTS[0])
            with self.assertRaisesRegex(ValueError, 'current call'):
                service.begin_call('+14255550124')

    def test_stale_call_cannot_change_current_call(self):
        service.CURRENT = dict(callId='current', state='dialing')
        service.set_call('old', 'answered')
        self.assertEqual(service.CURRENT['state'], 'dialing')
        self.assertEqual(service.EVENTS, [])

    def test_transcriber_token_cannot_publish(self):
        import jwt
        env = {'LIVEKIT_API_KEY':'test', 'LIVEKIT_API_SECRET':'a-test-secret-that-is-at-least-32-bytes'}
        with patch.dict(os.environ, env):
            token = service.token('transcriber')
        claims = jwt.decode(token, env['LIVEKIT_API_SECRET'], algorithms=['HS256'])
        self.assertFalse(claims['video']['canPublish'])
        self.assertTrue(claims['video']['canSubscribe'])
        self.assertEqual(claims['video']['room'], service.ROOM)

    def test_event_ids_are_unique(self):
        service.emit('call.dialing', callId='test')
        service.emit('call.answered', callId='test')
        self.assertNotEqual(service.EVENTS[0]['eventId'], service.EVENTS[1]['eventId'])

class HangupRequestTests(unittest.TestCase):
    def request(self):
        import io, json
        raw=json.dumps({'callId':'active'}).encode()
        results=[]
        handler=SimpleNamespace(path='/hangup',headers={'Content-Length':str(len(raw))},rfile=io.BytesIO(raw),authorized=lambda:True,reply=lambda status,body:results.append((status,body)))
        service.Handler.do_POST(handler)
        return results

    def setUp(self):
        service.CURRENT=dict(callId='active',state='answered',participant='outbound-'+'a'*32)
        service.EVENTS.clear()

    def test_provider_failure_remains_retryable_and_does_not_claim_ended(self):
        async def fail(identity): raise ValueError('Provider unavailable')
        with patch.object(service.photon,'hangup',side_effect=fail):
            result=self.request()
        self.assertEqual(result[0][0],400)
        self.assertEqual(service.CURRENT['state'],'answered')
        self.assertFalse(any(e['type']=='call.ended' for e in service.EVENTS))

    def test_only_confirms_ended_after_provider_succeeds(self):
        async def success(identity):
            self.assertEqual(service.CURRENT['state'],'ending')
        with patch.object(service.photon,'hangup',side_effect=success):
            result=self.request()
        self.assertEqual(result[0][0],200)
        self.assertEqual(service.CURRENT['state'],'ended')


class SellerGraceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        service.EVENTS.clear()
        service.CURRENT = dict(callId='abc', participant='outbound-' + 'a' * 32, state='answered')

    async def test_seller_comes_back_in_time_keeps_the_call(self):
        with patch.object(service.photon, 'hangup') as hangup:
            ended = await service.hang_up_if_seller_stays_gone('abc', lambda: True, delay=0)
        self.assertFalse(ended)
        hangup.assert_not_called()
        self.assertEqual(service.CURRENT['state'], 'answered')
        self.assertEqual(service.EVENTS[-1]['type'], 'seller.reconnected')

    async def test_seller_never_returns_hangs_up(self):
        async def fake_hangup(identity): return {}
        with patch.object(service.photon, 'hangup', side_effect=fake_hangup) as hangup:
            ended = await service.hang_up_if_seller_stays_gone('abc', lambda: False, delay=0)
        self.assertTrue(ended)
        hangup.assert_called_once()
        self.assertEqual(service.CURRENT['state'], 'ended')

    async def test_does_nothing_if_the_call_already_ended_or_is_a_different_call(self):
        with patch.object(service.photon, 'hangup') as hangup:
            service.CURRENT['state'] = 'ended'
            self.assertFalse(await service.hang_up_if_seller_stays_gone('abc', lambda: False, delay=0))
            service.CURRENT = dict(callId='other', participant='outbound-' + 'b' * 32, state='answered')
            self.assertFalse(await service.hang_up_if_seller_stays_gone('abc', lambda: False, delay=0))
        hangup.assert_not_called()


if __name__ == '__main__':unittest.main()
