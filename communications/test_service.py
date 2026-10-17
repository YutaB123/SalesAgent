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

if __name__ == '__main__':unittest.main()
