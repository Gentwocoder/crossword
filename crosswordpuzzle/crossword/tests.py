from django.test import TestCase, Client
from django.urls import reverse
from .models import CrosswordPuzzle, Word, Player, SolvedWord
import json
from django.utils import timezone
from datetime import timedelta

# Create your tests here.

class CrosswordPuzzleModelTests(TestCase):
    def setUp(self):
        self.puzzle = CrosswordPuzzle.objects.create(
            rows=15,
            cols=15,
            duration=30
        )

    def test_puzzle_creation(self):
        self.assertEqual(self.puzzle.status, 'waiting')
        self.assertEqual(len(self.puzzle.code), 8)
        self.assertEqual(self.puzzle.duration, 30)

    def test_puzzle_validation(self):
        with self.assertRaises(Exception):
            CrosswordPuzzle.objects.create(
                rows=51,  # Exceeds MAX_ROWS
                cols=15,
                duration=30
            )

class WordModelTests(TestCase):
    def setUp(self):
        self.puzzle = CrosswordPuzzle.objects.create(
            rows=15,
            cols=15,
            duration=30
        )

    def test_word_creation(self):
        word = Word.objects.create(
            puzzle=self.puzzle,
            word="TEST",
            hint="A test word",
            direction="across",
            start_row=0,
            start_col=0
        )
        self.assertEqual(word.word, "TEST")
        self.assertEqual(word.direction, "across")

    def test_word_validation(self):
        # Test word extending beyond puzzle bounds
        with self.assertRaises(Exception):
            Word.objects.create(
                puzzle=self.puzzle,
                word="TOOLONGWORD",
                hint="This word is too long",
                direction="across",
                start_row=14,  # Last row
                start_col=10   # Will extend beyond puzzle width
            )

class PlayerModelTests(TestCase):
    def setUp(self):
        self.puzzle = CrosswordPuzzle.objects.create(
            rows=15,
            cols=15,
            duration=30
        )
        self.player = Player.objects.create(
            display_name="Player1",
            puzzle=self.puzzle
        )

    def test_player_creation(self):
        self.assertEqual(self.player.display_name, "Player1")
        self.assertEqual(self.player.points, 0)
        self.assertTrue(self.player.is_active)

    def test_add_points(self):
        self.player.add_points(5)
        self.assertEqual(self.player.points, 5)

class SolvedWordModelTests(TestCase):
    def setUp(self):
        self.puzzle = CrosswordPuzzle.objects.create(
            rows=15,
            cols=15,
            duration=30
        )
        self.word = Word.objects.create(
            puzzle=self.puzzle,
            word="TEST",
            hint="A test word",
            direction="across",
            start_row=0,
            start_col=0
        )
        self.solved_word = SolvedWord.objects.create(
            puzzle=self.puzzle,
            word=self.word
        )

    def test_solved_word_creation(self):
        self.assertEqual(self.solved_word.word.word, "TEST")
        self.assertEqual(self.solved_word.puzzle, self.puzzle)

class ViewTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.puzzle_data = {
            'rows': 15,
            'cols': 15,
            'duration': 30,
            'words': [
                {
                    'word': 'TEST',
                    'hint': 'A test word',
                    'direction': 'across',
                    'startRow': 0,
                    'startCol': 0
                }
            ]
        }

    def test_create_puzzle(self):
        response = self.client.post(
            reverse('create_puzzle'),
            data=json.dumps(self.puzzle_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue('code' in response.json())

    def test_join_puzzle(self):
        # First create a puzzle
        create_response = self.client.post(
            reverse('create_puzzle'),
            data=json.dumps(self.puzzle_data),
            content_type='application/json'
        )
        puzzle_code = create_response.json()['code']

        # Try to join the puzzle
        join_data = {
            'code': puzzle_code,
            'display_name': 'TestPlayer'
        }
        response = self.client.post(
            reverse('join_puzzle'),
            data=json.dumps(join_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['success'])

        # Try to join with same name (should fail)
        response = self.client.post(
            reverse('join_puzzle'),
            data=json.dumps(join_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)

    def test_get_puzzle(self):
        # First create and join a puzzle
        create_response = self.client.post(
            reverse('create_puzzle'),
            data=json.dumps(self.puzzle_data),
            content_type='application/json'
        )
        puzzle_code = create_response.json()['code']

        join_data = {
            'code': puzzle_code,
            'display_name': 'TestPlayer'
        }
        self.client.post(
            reverse('join_puzzle'),
            data=json.dumps(join_data),
            content_type='application/json'
        )

        # Get puzzle data
        response = self.client.get(reverse('get_puzzle', args=[puzzle_code]))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['rows'], 15)
        self.assertEqual(data['cols'], 15)
        self.assertEqual(len(data['words']), 1)
        self.assertEqual(data['status'], 'waiting')

    def test_start_game(self):
        # Create and join puzzle
        create_response = self.client.post(
            reverse('create_puzzle'),
            data=json.dumps(self.puzzle_data),
            content_type='application/json'
        )
        puzzle_code = create_response.json()['code']

        join_data = {
            'code': puzzle_code,
            'display_name': 'TestPlayer'
        }
        join_response = self.client.post(
            reverse('join_puzzle'),
            data=json.dumps(join_data),
            content_type='application/json'
        )
        player_id = join_response.json()['player_id']

        # Set session player_id
        session = self.client.session
        session['player_id'] = player_id
        session.save()

        # Start game as first player
        response = self.client.post(reverse('start_game', args=[puzzle_code]))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['success'])

    def test_submit_word(self):
        # Create and join puzzle
        create_response = self.client.post(
            reverse('create_puzzle'),
            data=json.dumps(self.puzzle_data),
            content_type='application/json'
        )
        puzzle_code = create_response.json()['code']

        join_data = {
            'code': puzzle_code,
            'display_name': 'TestPlayer'
        }
        join_response = self.client.post(
            reverse('join_puzzle'),
            data=json.dumps(join_data),
            content_type='application/json'
        )
        player_id = join_response.json()['player_id']

        # Set session player_id
        session = self.client.session
        session['player_id'] = player_id
        session.save()

        # Start game
        self.client.post(reverse('start_game', args=[puzzle_code]))

        # Submit correct word
        submit_data = {'word': 'TEST'}
        response = self.client.post(
            reverse('submit_word', args=[puzzle_code]),
            data=json.dumps(submit_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['success'])

        # Submit incorrect word
        submit_data = {'word': 'WRONG'}
        response = self.client.post(
            reverse('submit_word', args=[puzzle_code]),
            data=json.dumps(submit_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)

    def test_get_players(self):
        # Create and join puzzle
        create_response = self.client.post(
            reverse('create_puzzle'),
            data=json.dumps(self.puzzle_data),
            content_type='application/json'
        )
        puzzle_code = create_response.json()['code']

        join_data = {
            'code': puzzle_code,
            'display_name': 'TestPlayer'
        }
        self.client.post(
            reverse('join_puzzle'),
            data=json.dumps(join_data),
            content_type='application/json'
        )

        response = self.client.get(reverse('get_players', args=[puzzle_code]))
        self.assertEqual(response.status_code, 200)
        self.assertIn('players', response.json())

    def test_reconnect(self):
        # Create and join puzzle
        create_response = self.client.post(
            reverse('create_puzzle'),
            data=json.dumps(self.puzzle_data),
            content_type='application/json'
        )
        puzzle_code = create_response.json()['code']

        join_data = {
            'code': puzzle_code,
            'display_name': 'TestPlayer'
        }
        join_response = self.client.post(
            reverse('join_puzzle'),
            data=json.dumps(join_data),
            content_type='application/json'
        )
        player_id = join_response.json()['player_id']

        # Set session player_id
        session = self.client.session
        session['player_id'] = player_id
        session.save()

        # Reconnect player
        reconnect_data = {'display_name': 'TestPlayer'}
        response = self.client.post(
            reverse('reconnect', args=[puzzle_code]),
            data=json.dumps(reconnect_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['success'])

    def test_leaderboard(self):
        # Create and join puzzle
        create_response = self.client.post(
            reverse('create_puzzle'),
            data=json.dumps(self.puzzle_data),
            content_type='application/json'
        )
        puzzle_code = create_response.json()['code']

        join_data = {
            'code': puzzle_code,
            'display_name': 'TestPlayer'
        }
        self.client.post(
            reverse('join_puzzle'),
            data=json.dumps(join_data),
            content_type='application/json'
        )

        response = self.client.get(reverse('leaderboard', args=[puzzle_code]))
        self.assertEqual(response.status_code, 200)
        self.assertIn('players', response.context)
