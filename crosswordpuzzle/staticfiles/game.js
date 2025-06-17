document.addEventListener('DOMContentLoaded', function() {
    // Get player info from session storage
    const playerId = sessionStorage.getItem('playerId');
    const playerName = sessionStorage.getItem('playerName');
    const puzzleCode = sessionStorage.getItem('puzzleCode');

    if (!playerId || !playerName || !puzzleCode) {
        console.error('Missing player info:', { playerId, playerName, puzzleCode });
        window.location.href = '/';
        return;
    }

    // Display game info
    const puzzleCodeElement = document.getElementById('puzzle-code');
    const playerNameElement = document.getElementById('player-name');
    const gameStatusElement = document.getElementById('game-status');
    const leaderboardList = document.getElementById('leaderboard-list');
    const startGameBtn = document.getElementById('start-game-btn');
    
    if (puzzleCodeElement) puzzleCodeElement.textContent = `Puzzle Code: ${puzzleCode}`;
    if (playerNameElement) playerNameElement.textContent = `Player: ${playerName}`;
    if (gameStatusElement) gameStatusElement.textContent = 'Status: Connecting...';

    // State variables
    let puzzle = null;
    let currentDirection = 'across';
    let selectedCell = null;
    let selectedClue = null;
    let playerAnswers = {};
    let players = [];
    let isLoading = false;
    let pollingInterval = null;
    let isCreator = false;
    let countdownInterval = null;
    let puzzleStartTime = null;
    let countdownStarted = false;
    let timerInterval = null;
    let gameData = null;
    let waitingRoomTimer = null;
    let waitingRoomSeconds = 40;
    let waitingRoomTimerStarted = false;

    // Add loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(loadingIndicator);

    function showLoading() {
        isLoading = true;
        loadingIndicator.style.display = 'flex';
    }

    function hideLoading() {
        isLoading = false;
        loadingIndicator.style.display = 'none';
    }

    function showError(message, duration = 5000) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);

        setTimeout(() => {
            errorDiv.classList.add('fade-out');
            setTimeout(() => errorDiv.remove(), 500);
        }, duration);
    }

    async function fetchWithTimeout(resource, options = {}) {
        const { timeout = 5000 } = options;
        
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(resource, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(id);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Network response was not ok');
            }
            
            return response;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out');
            }
            throw error;
        }
    }

    // Fetch puzzle data with retry logic
    async function fetchPuzzleData(retries = 3, silent = false) {
        if (!silent) showLoading();
        
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(`/api/puzzle/${puzzleCode}/`, {
                    headers: {
                        'X-CSRFToken': getCsrfToken()
                    }
                });
                if (response.status === 401) {
                    showError('Your session has expired. Please rejoin the game.');
                    if (!silent) {
                        setTimeout(() => {
                            window.location.href = '/join/';
                        }, 3000);
                    }
                    if (!silent) hideLoading();
                    throw new Error('Session expired');
                }
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to fetch puzzle data');
                }
                const data = await response.json();
                if (!silent) hideLoading();
                return data;
            } catch (error) {
                console.error('Error fetching puzzle:', error);
                if (i === retries - 1) {
                    if (!silent) hideLoading();
                    showError('Failed to load puzzle. Please refresh the page.');
                    throw error;
                }
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
            }
        }
    }

    // Initialize the game
    async function initializeGame() {
        try {
            puzzle = await fetchPuzzleData();
            
            if (!puzzle) {
                throw new Error('Failed to fetch puzzle data');
            }
            
            // Store puzzle start time
            puzzleStartTime = puzzle.start_time ? new Date(puzzle.start_time) : null;
            countdownStarted = false;

            // Update game status
            if (gameStatusElement) {
                gameStatusElement.textContent = `Status: ${puzzle.status}`;
            }

            // Initialize game components
            initializeGrid();
            initializeClues();
            updateGameState(puzzle);
            startPolling();
        } catch (error) {
            console.error('Failed to initialize game:', error);
            showError('Failed to initialize game. Please refresh the page.');
            throw error; // Re-throw to prevent further execution
        }
    }

    function getCsrfToken() {
        const name = 'csrftoken';
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    function initializeGrid() {
        const grid = document.getElementById('crossword-grid');
        grid.style.gridTemplateColumns = `repeat(${puzzle.cols}, 40px)`;
        grid.innerHTML = ''; // Clear existing content

        // Create empty grid
        for (let i = 0; i < puzzle.rows; i++) {
            for (let j = 0; j < puzzle.cols; j++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = i;
                cell.dataset.col = j;

                const input = document.createElement('input');
                input.type = 'text';
                input.maxLength = 1;
                input.dataset.row = i;
                input.dataset.col = j;
                input.autocomplete = 'off';
                input.spellcheck = false;

                // Add event listeners for cell interaction
                input.addEventListener('click', () => handleCellClick(i, j));
                input.addEventListener('keydown', (e) => handleKeyPress(e, i, j));
                input.addEventListener('input', (e) => handleInput(e, i, j));
                input.addEventListener('focus', () => handleCellFocus(i, j));

                cell.appendChild(input);
                grid.appendChild(cell);
            }
        }

        // Initialize black cells and numbers
        initializeBlackCells();
        addCellNumbers();
    }

    function initializeBlackCells() {
        // Create a map of all cells that are part of words
        const usedCells = new Set();
        puzzle.words.forEach(word => {
            const length = word.word.length;
            for (let i = 0; i < length; i++) {
                if (word.direction === 'across') {
                    usedCells.add(`${word.start_row},${word.start_col + i}`);
                } else {
                    usedCells.add(`${word.start_row + i},${word.start_col}`);
                }
            }
        });

        // Make unused cells black
        for (let i = 0; i < puzzle.rows; i++) {
            for (let j = 0; j < puzzle.cols; j++) {
                if (!usedCells.has(`${i},${j}`)) {
                    const cell = document.querySelector(`.cell[data-row="${i}"][data-col="${j}"]`);
                    if (cell) {
                        cell.classList.add('black');
                        const input = cell.querySelector('input');
                        if (input) {
                            input.disabled = true;
                        }
                    }
                }
            }
        }
    }

    function addCellNumbers() {
        let cellNumber = 1;
        const numberedCells = new Set();

        puzzle.words.forEach(word => {
            const key = `${word.start_row},${word.start_col}`;
            if (!numberedCells.has(key)) {
                const cell = document.querySelector(`.cell[data-row="${word.start_row}"][data-col="${word.start_col}"]`);
                if (cell) {
                    const numberDiv = document.createElement('div');
                    numberDiv.className = 'cell-number';
                    numberDiv.textContent = cellNumber;
                    cell.insertBefore(numberDiv, cell.firstChild);
                    numberedCells.add(key);
                    cellNumber++;
                }
            }
        });
    }

    function handleCellClick(row, col) {
        // Find the word that contains this cell
        const word = findWordAtPosition(row, col);
        if (!word) return;

        // Update current direction and selected cell
        currentDirection = word.direction;
        selectedCell = { row, col };

        // Highlight the word
        highlightWord(word);
        
        // Update clue selection
        updateClueSelection(word);
    }

    function handleCellFocus(row, col) {
        const word = findWordAtPosition(row, col);
        if (!word) return;

        // Update current direction and selected cell
        currentDirection = word.direction;
        selectedCell = { row, col };

        // Highlight the word
        highlightWord(word);
        
        // Update clue selection
        updateClueSelection(word);
    }

    function handleInput(event, row, col) {
        const input = event.target;
        const value = input.value.toUpperCase();
        
        // Update the input value
        input.value = value;

        if (value) {
            // Store the answer
            const key = `${row},${col}`;
            playerAnswers[key] = value;

            // Move to next cell if a letter was entered
            if (currentDirection === 'across') {
                moveToNextCell(row, col + 1);
            } else {
                moveToNextCell(row + 1, col);
            }

            // Check if the word is complete
            checkWordCompletion();
        }
    }

    function handleKeyPress(event, row, col) {
        const input = event.target;

        switch (event.key) {
            case 'Backspace':
                if (!input.value) {
                    event.preventDefault();
                    if (currentDirection === 'across') {
                        moveToNextCell(row, col - 1);
                    } else {
                        moveToNextCell(row - 1, col);
                    }
                }
                break;
            case 'Delete':
                input.value = '';
                break;
            case 'ArrowRight':
                event.preventDefault();
                moveToNextCell(row, col + 1);
                break;
            case 'ArrowLeft':
                event.preventDefault();
                moveToNextCell(row, col - 1);
                break;
            case 'ArrowDown':
                event.preventDefault();
                moveToNextCell(row + 1, col);
                break;
            case 'ArrowUp':
                event.preventDefault();
                moveToNextCell(row - 1, col);
                break;
            case 'Tab':
                event.preventDefault();
                moveToNextWord();
                break;
            case ' ':
                event.preventDefault();
                // Toggle direction
                currentDirection = currentDirection === 'across' ? 'down' : 'across';
                handleCellFocus(row, col);
                break;
        }
    }

    function findWordAtPosition(row, col) {
        return puzzle.words.find(word => {
            const length = word.word.length;
            if (word.direction === 'across') {
                return row === word.start_row && col >= word.start_col && col < word.start_col + length;
            } else {
                return col === word.start_col && row >= word.start_row && row < word.start_row + length;
            }
        });
    }

    function moveToNextCell(row, col) {
        const nextCell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"] input:not([disabled])`);
        if (nextCell) {
            nextCell.focus();
        }
    }

    function moveToNextWord() {
        const currentWord = findWordAtPosition(selectedCell.row, selectedCell.col);
        if (!currentWord) return;

        const currentIndex = puzzle.words.indexOf(currentWord);
        const nextWord = puzzle.words[(currentIndex + 1) % puzzle.words.length];

        // Select the first cell of the next word
        const cell = document.querySelector(
            `.cell[data-row="${nextWord.start_row}"][data-col="${nextWord.start_col}"]`
        );
        if (cell) {
            cell.querySelector('input').focus();
        }
    }

    function highlightWord(word) {
        // Remove previous highlights
        document.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('highlighted');
            cell.classList.remove('selected');
        });

        // Highlight the word cells
        for (let i = 0; i < word.word.length; i++) {
            const row = word.direction === 'across' ? word.start_row : word.start_row + i;
            const col = word.direction === 'across' ? word.start_col + i : word.start_col;
            const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
            if (cell) {
                cell.classList.add('highlighted');
            }
        }

        // Highlight the selected cell
        if (selectedCell) {
            const cell = document.querySelector(`.cell[data-row="${selectedCell.row}"][data-col="${selectedCell.col}"]`);
            if (cell) {
                cell.classList.add('selected');
            }
        }
    }

    function updateClueSelection(word) {
        // Remove previous selection
        document.querySelectorAll('.clues-container li.active').forEach(li => {
            li.classList.remove('active');
        });

        // Find and select the new clue
        const clue = document.querySelector(
            `.clues-container li[data-direction="${word.direction}"][data-start-row="${word.start_row}"][data-start-col="${word.start_col}"]`
        );
        if (clue) {
            clue.classList.add('active');
            selectedClue = clue;
        }
    }

    function checkWordCompletion() {
        const word = findWordAtPosition(selectedCell.row, selectedCell.col);
        if (!word) return;

        // Get the current answer
        let answer = '';
        for (let i = 0; i < word.word.length; i++) {
            const row = word.direction === 'across' ? word.start_row : word.start_row + i;
            const col = word.direction === 'across' ? word.start_col + i : word.start_col;
            const input = document.querySelector(
                `.cell[data-row="${row}"][data-col="${col}"] input`
            );
            answer += input.value;
        }

        // Check if the answer is correct
        if (answer === word.word) {
            // Mark the word as completed
            const clue = document.querySelector(
                `.clues-container li[data-direction="${word.direction}"][data-start-row="${word.start_row}"][data-start-col="${word.start_col}"]`
            );
            if (clue) {
                clue.classList.add('completed');
            }

            // Update player's answers
            playerAnswers[`${word.direction}-${word.start_row}-${word.start_col}`] = answer;
        }
    }

    function startPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }

        // Poll for updates every 5 seconds
        pollingInterval = setInterval(async () => {
            if (isLoading) return; // Skip if already loading

            try {
                const data = await fetchPuzzleData(3, true);
                updateGameState(data);
            } catch (error) {
                console.error('Polling error:', error);
                // Don't show error for polling failures to avoid spam
                // But do log it for debugging
            }
        }, 5000);
    }

    function updateGameState(data) {
        // Update game status
        const gameStatus = document.getElementById('game-status');
        
        if (gameStatus) {
            gameStatus.textContent = `Status: ${data.status}`;
        }
        // Redirect to leaderboard if game is completed
        if (data.status === 'completed') {
            window.location.href = `/leaderboard/${puzzleCode}/`;
            return;
        }
        // Show/hide waiting room and game board
        const waitingRoom = document.getElementById('waiting-room');
        const gameBoard = document.getElementById('game-board');
        if (waitingRoom && gameBoard) {
            if (data.status === 'waiting') {
                waitingRoom.classList.remove('hidden');
                gameBoard.classList.add('hidden');
                if (!waitingRoomTimerStarted) {
                    startWaitingRoomTimer();
                }
                updateStartButton();
                // Start countdown only once
                // if (puzzleStartTime && !countdownStarted) {
                //     startCountdown(puzzleStartTime);
                //     countdownStarted = true;
               // }
            } else {
                waitingRoom.classList.add('hidden');
                gameBoard.classList.remove('hidden');
                clearWaitingRoomTimer();
                updateLeaderboard();
                updateTimer();
            }
        }
        // Update player list
        updatePlayersList(data.players);
        // Disable cells for all solved words
        if (data.solved_words && Array.isArray(data.solved_words)) {
            data.solved_words.forEach(wordStr => {
                const wordObj = puzzle.words.find(w => w.word === wordStr);
                if (wordObj) {
                    disableWordCells(wordObj);
                }
            });
        }
        // Update timer if game is in progress
        if (data.status === 'in_progress' && data.time_remaining !== null) {
            updateTimer(Math.floor(data.time_remaining));
        } else {
            // Clear timer if game is not in progress
            if (timerInterval) {
                clearInterval(timerInterval);
            }
            const timerElement = document.getElementById('timer');
            if (timerElement) {
                timerElement.textContent = data.status === 'waiting' ? 'Waiting to start...' : 'Game Over';
                timerElement.classList.remove('warning');
            }
        }
    }

    function startWaitingRoomTimer() {
        if (waitingRoomTimerStarted) return; // Prevent multiple timers
        clearWaitingRoomTimer();
        waitingRoomSeconds = 40;
        waitingRoomTimerStarted = true;
        const timerDisplay = document.getElementById("waiting-room-timer");
        if (timerDisplay) timerDisplay.textContent = `Game will start in ${waitingRoomSeconds} seconds...`;

        waitingRoomTimer = setInterval(() =>{
            waitingRoomSeconds--;
            if (timerDisplay) timerDisplay.textContent = `Game will start in ${waitingRoomSeconds} seconds...`;
            if (waitingRoomSeconds <= 0) {
                clearWaitingRoomTimer();
                // Redirect to game board or trigger game start
                window.location.href = `/game/${puzzleCode}`
                // If you want to auto-start the game as the creator:
                if (isCreator) {
                    startGameBtn.click();
                }
            }
        }, 1000);
    }

        function clearWaitingRoomTimer() {
            if (waitingRoomTimer) {
                clearInterval(waitingRoomTimer);
                waitingRoomTimer = null;
            }
            waitingRoomTimerStarted = false;
        }

    // Update leaderboard
    function updateLeaderboard() {
        // const leaderboardList = document.getElementById('leaderboard-list');
        if (!leaderboardList || !gameData || !gameData.players) return;
        // Clear current leaderboard
        leaderboardList.innerHTML = '';
        const sortedPlayers = [...gameData.players].sort((a, b) => b.points - a.points);
        sortedPlayers.forEach(player => {
            const li = document.createElement('li');
            li.className= 'leaderboard-item';
            // Add player rank
            const rankSpan = document.createElement('span');
            rankSpan.className = 'player-rank';
            const rank = sortedPlayers.indexOf(player) + 1;
            rankSpan.textContent = `#${rank}`;
            
            // Add player name
            const nameSpan = document.createElement('span');
            nameSpan.className = 'player-name';
            nameSpan.textContent = player.display_name || player.name || 'Unnamed';
            
            // Add points
            const pointsSpan = document.createElement('span');
            pointsSpan.className = 'player-points';
            pointsSpan.textContent = `${player.points} points`;
            
            li.appendChild(rankSpan);
            li.appendChild(nameSpan);
            li.appendChild(pointsSpan);
            leaderboardList.appendChild(li);
        });
    }

    function updateStartButton() {
        if (!startGameBtn || !gameData || !gameData.players) return;
        // The creator is the first player in the list
        const isCreator = gameData.players.find(player => player.is_creator);
        // Check if the current player is the creator
        if (isCreator && isCreator.id === playerId) {
            startGameBtn.style.display = (gameData.status === 'waiting') ? 'block' : 'none';
            startGameBtn.disabled = false;
        }
        // isCreator = gameData.players.length > 0 && (gameData.players[0].id === playerId || gameData.players[0].player_id === playerId);
        // startGameBtn.style.display = (gameData.status === 'waiting' && isCreator) ? 'block' : 'none';
        // startGameBtn.disabled = false;
    }

    function disableWordCells(wordObj) {
        for (let i = 0; i < wordObj.word.length; i++) {
            const row = wordObj.direction === 'across' ? wordObj.start_row : wordObj.start_row + i;
            const col = wordObj.direction === 'across' ? wordObj.start_col + i : wordObj.start_col;
            const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"] input`);
            if (cell) {
                cell.disabled = true;
                cell.classList.add('inactive');
            }
        }
    }

    function updateTimer(seconds) {
        const timerElement = document.getElementById('timer');
        if (!timerElement) return;

        // Clear any existing interval
        if (timerInterval) {
            clearInterval(timerInterval);
        }

        // Only run timer if seconds is a valid number
        if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
            timerElement.textContent = '--:--';
            timerElement.classList.remove('warning');
            return;
        }

        // Format time as MM:SS
        function formatTime(seconds) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        }

        // Update timer display
        function updateDisplay() {
            if (seconds <= 0) {
                clearInterval(timerInterval);
                timerElement.textContent = 'Time\'s up!';
                timerElement.classList.add('warning');
                return;
            }
            timerElement.textContent = `Time Remaining: ${formatTime(seconds)}`;
            
            // Add warning class when less than 1 minute remains
            if (seconds <= 60) {
                timerElement.classList.add('warning');
            } else {
                timerElement.classList.remove('warning');
            }
            
            seconds--;
        }

        // Initial update
        updateDisplay();

        // Update every second
        timerInterval = setInterval(updateDisplay, 1000);
    }

    function updatePlayersList(playersList) {
        const list = document.getElementById('players-list');
        if (!list) return;

        list.innerHTML = '';
        playersList.forEach(player => {
            const li = document.createElement('li');
            li.className = 'player-item';
            if (player.id === playerId) {
                li.classList.add('current');
            }
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'player-name';
            nameSpan.textContent = player.display_name;
            
            const scoreSpan = document.createElement('span');
            scoreSpan.className = 'player-score';
            scoreSpan.textContent = `Score: ${player.points}`;
            
            li.appendChild(nameSpan);
            li.appendChild(scoreSpan);
            list.appendChild(li);
        });
    }

    function initializeClues() {
        // Find or create containers for clues
        let acrossContainer = document.getElementById('across-clues');
        let downContainer = document.getElementById('down-clues');

        // If containers do not exist, create them and append to body (fallback)
        if (!acrossContainer) {
            acrossContainer = document.createElement('div');
            acrossContainer.id = 'across-clues';
            acrossContainer.innerHTML = '<h3>Across</h3>';
            document.body.appendChild(acrossContainer);
        } else {
            acrossContainer.innerHTML = '<h3>Across</h3>';
        }
        if (!downContainer) {
            downContainer = document.createElement('div');
            downContainer.id = 'down-clues';
            downContainer.innerHTML = '<h3>Down</h3>';
            document.body.appendChild(downContainer);
        } else {
            downContainer.innerHTML = '<h3>Down</h3>';
        }

        // Group words by direction and sort by their starting position
        const acrossWords = puzzle.words.filter(w => w.direction === 'across')
            .sort((a, b) => (a.start_row - b.start_row) || (a.start_col - b.start_col));
        const downWords = puzzle.words.filter(w => w.direction === 'down')
            .sort((a, b) => (a.start_col - b.start_col) || (a.start_row - b.start_row));

        // Add clues to containers
        acrossWords.forEach((word, idx) => {
            const clueDiv = document.createElement('div');
            clueDiv.className = 'clue';
            clueDiv.textContent = `${idx + 1}. ${word.hint}`;
            acrossContainer.appendChild(clueDiv);
        });
        downWords.forEach((word, idx) => {
            const clueDiv = document.createElement('div');
            clueDiv.className = 'clue';
            clueDiv.textContent = `${idx + 1}. ${word.hint}`;
            downContainer.appendChild(clueDiv);
        });
    }

    // Countdown timer logic
    function startCountdown(startTime) {
        stopCountdown();
        const countdownSeconds = document.getElementById('countdown-seconds');
        const countdownTimer = document.getElementById('countdown-timer');
        if (!countdownSeconds || !startTime) return;
        function updateCountdown() {
            const now = new Date();
            const secondsLeft = Math.max(0, Math.ceil((startTime - now) / 1000));
            countdownSeconds.textContent = secondsLeft;
            if (countdownTimer) {
                countdownTimer.textContent = `Game starts in ${secondsLeft} second${secondsLeft !== 1 ? 's' : ''}...`;
            }
            if (secondsLeft <= 0) {
                stopCountdown();
            }
        }
        updateCountdown();
        countdownInterval = setInterval(updateCountdown, 1000);
    }
    function stopCountdown() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        const countdownTimer = document.getElementById('countdown-timer');
        if (countdownTimer) countdownTimer.textContent = '';
    }

    // Start the game initialization
    initializeGame();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }
    });

    async function submitWordToServer(wordStr, wordObj) {
        try {
            const response = await fetch(`/api/puzzle/${puzzleCode}/submit/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify({ word: wordStr })
            });
            const data = await response.json();
            if (response.ok && data.success) {
                // Disable all cells for this word
                disableWordCells(wordObj);
                // Optionally update score immediately
                updatePlayerScore(data.points);
            } else if (data && data.error) {
                showError(data.error);
            }
        } catch (error) {
            showError('Error submitting word.');
        }
    }
}); 