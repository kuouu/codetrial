import json
import unittest
from types import SimpleNamespace

from agent import InterviewState, clean_report, handle_packet


class FakeSessionInput:
    def __init__(self):
        self.audio_enabled = True

    def set_audio_enabled(self, enabled):
        self.audio_enabled = enabled


class FakeSession:
    def __init__(self):
        self.input = FakeSessionInput()
        self.interrupted = False
        self.turn_committed = False
        self.replies = []

    async def interrupt(self, *, force=False):
        self.interrupted = force

    async def commit_user_turn(self, *, skip_reply=False):
        self.turn_committed = skip_reply

    async def generate_reply(self, **kwargs):
        self.replies.append(kwargs)


class FakeRoomParticipant:
    def __init__(self):
        self.published = []

    async def publish_data(self, payload, *, topic, reliable):
        self.published.append((json.loads(payload), topic, reliable))


class FakeRoom:
    def __init__(self):
        self.local_participant = FakeRoomParticipant()


def control_packet(value):
    return SimpleNamespace(
        participant=SimpleNamespace(identity="candidate-test"),
        topic="control",
        data=json.dumps(value).encode("utf-8"),
    )


class ReportCleaningTests(unittest.TestCase):
    def test_keeps_valid_coding_score_when_optional_feedback_is_partial(self):
        report = clean_report(
            {
                "codingScore": 78,
                "communicationScore": None,
                "decision": "NO_HIRE",
                "summary": "The solution handled the main case.",
                "codingFeedback": {"strengths": ["Used a map"]},
            }
        )

        self.assertIsNotNone(report)
        self.assertEqual(report["codingScore"], 78)
        self.assertEqual(report["codingFeedback"]["strengths"], ["Used a map"])
        self.assertEqual(report["codingFeedback"]["improvements"], [])

    def test_preserves_model_marked_incomplete_report_without_inventing_score(self):
        report = clean_report(
            {
                "incomplete": True,
                "summary": "There was not enough evidence to assess coding.",
                "codingFeedback": {"strengths": [], "improvements": []},
            }
        )

        self.assertEqual(report["incomplete"], True)
        self.assertNotIn("codingScore", report)
        self.assertIn("not enough evidence", report["summary"])

    def test_treats_summary_without_score_as_incomplete_instead_of_rejecting_it(self):
        report = clean_report(
            {"summary": "The code was not received by the report model."}
        )

        self.assertEqual(report["incomplete"], True)
        self.assertNotIn("codingScore", report)
        self.assertEqual(
            report["summary"], "The code was not received by the report model."
        )

    def test_keeps_valid_score_in_model_marked_incomplete_report(self):
        report = clean_report(
            {
                "incomplete": True,
                "codingScore": 64,
                "summary": "The code was visible, but the discussion was brief.",
            }
        )

        self.assertEqual(report["incomplete"], True)
        self.assertEqual(report["codingScore"], 64)


class TurnControlTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.state = InterviewState(
            metadata={"candidateIdentity": "candidate-test"},
            problem={},
        )
        self.session = FakeSession()
        self.room = FakeRoom()

    async def test_thinking_hold_interrupts_and_acknowledges_then_resumes(self):
        await handle_packet(
            control_packet({"type": "thinking", "thinking": True}),
            self.state,
            self.session,
            self.room,
        )

        self.assertTrue(self.session.interrupted)
        self.assertFalse(self.session.input.audio_enabled)
        self.assertEqual(
            self.room.local_participant.published[-1][0],
            {"type": "thinking_state", "thinking": True},
        )

        await handle_packet(
            control_packet({"type": "thinking", "thinking": False}),
            self.state,
            self.session,
            self.room,
        )

        self.assertTrue(self.session.input.audio_enabled)
        self.assertEqual(
            self.room.local_participant.published[-1][0],
            {"type": "thinking_state", "thinking": False},
        )

    async def test_yield_turn_requests_a_relevant_interviewer_reply(self):
        await handle_packet(
            control_packet({"type": "yield_turn"}),
            self.state,
            self.session,
            self.room,
        )

        self.assertEqual(len(self.session.replies), 1)
        self.assertTrue(self.session.turn_committed)
        self.assertIn("explicitly yielded", self.session.replies[0]["instructions"])
        self.assertTrue(self.session.replies[0]["allow_interruptions"])


if __name__ == "__main__":
    unittest.main()
