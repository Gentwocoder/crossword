document.addEventListener('DOMContentLoaded', () => {
    // Get elements
    const waitingRoom = document.getElementById('waiting-room');
    const gameBoard = document.getElementById('game-board');
    const playersList = document.getElementById('players-list');
    const leaderboardList = document.getElementById('leaderboard-list');
    const startGameBtn = document.getElementById('start-game-btn');
    const timeRemaining = document.getElementById('time-remaining');
    const crosswordGrid = document.getElementById('crossword-grid');
    const acrossClues = document.getElementById('across-clues');
    const downClues = document.getElementById('down-clues');
    const gameStatus = document.getElementById('game-status');

    // Get puzzle code from session storage
    const puzzleCode = sessionStorage.getItem('puzzleCode');
    if (!puzzleCode) {
        showError('No puzzle code found. Please join a game first.');
        return;
    }

    // Get player info from session storage
    const playerId = sessionStorage.getItem('playerId');
    const playerName = sessionStorage.getItem('playerName');
    if (!playerId || !playerName) {
        showError('Player information not found. Please join the game again.');
        return;
    }

    // Initialize game state
    let gameData = null;
    let selectedCell = null;
    let selectedDirection = 'across';
    let timerInterval = null;
    let isCreator = false;
    let isLoading = false;

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

    // Initialize game
    function initGame() {
        fetchPuzzleData(); // Show loader on first load
        // Poll for updates every 10 seconds without showing loader
        setInterval(() => fetchPuzzleData(true), 10000);
    }

    // Fetch puzzle data from server
    // Modify fetchPuzzleData to accept a 'silent' parameter
    function fetchPuzzleData(silent = false) {
        if (!silent) showLoading();
        fetch(`/api/puzzle/${puzzleCode}/`)
            .then(response => {
                if (!response.ok) {
                    return response.json().then(data => {
                        // If session expired or player not found, redirect to join page
                        if (response.status === 401) {
                            window.location.href = `/join/?code=${puzzleCode}`;
                            return;
                        }
                        throw new Error(data.error || 'Failed to fetch puzzle data');
                    });
                }
                return response.json();
            })
            .then(data => {
                if (!silent) hideLoading();
                gameData = data;
                updateUI();
            })
            .catch(error => {
                if (!silent) hideLoading();
                showError('Failed to fetch game data.');
            });
    }

    // Update UI based on game state
    function updateUI() {
        if (!gameData) return;

        // Update waiting room
        if (gameData.status === 'waiting') {
            waitingRoom.classList.remove('hidden');
            gameBoard.classList.add('hidden');
            updatePlayersList();
            updateStartButton();
        } else {
            waitingRoom.classList.add('hidden');
            gameBoard.classList.remove('hidden');
            updateGameBoard();
            updateLeaderboard();
            updateTimer();
        }

        // Update game status
        if (gameStatus) {
            gameStatus.textContent = `Status: ${gameData.status}`;
        }

        // Show/hide start button for creator
        if (startGameBtn) {
            // Check if current player is the creator (first player)
            isCreator = gameData.players.length > 0 && gameData.players[0].id === playerId;
            startGameBtn.style.display = gameData.status === 'waiting' && isCreator ? 'block' : 'none';
        }

        // Update player list
        updatePlayerList();

        // Update timer if game is in progress
        if (gameData.status === 'in_progress' && gameData.time_remaining !== null) {
            updateTimer(Math.floor(gameData.time_remaining));
        } else {
            // Clear timer if game is not in progress
            if (timerInterval) {
                clearInterval(timerInterval);
            }
            const timerElement = document.getElementById('timer');
            if (timerElement) {
                timerElement.textContent = gameData.status === 'waiting' ? 'Waiting to start...' : 'Game Over';
                timerElement.classList.remove('warning');
            }
        }

        // Update grid and clues
        updateGrid();
        updateClues();

        // Redirect to leaderboard if game is completed
        if (gameData.status === 'completed') {
            window.location.href = `/leaderboard/${gameData.code}/`;
        }
    }

    // Update players list in waiting room
    function updatePlayersList() {
        playersList.innerHTML = '';
        gameData.players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player.name;
            playersList.appendChild(li);
        });
    }

    // Update start game button visibility
    function updateStartButton() {
        if (!startGameBtn || !gameData || !gameData.players) return;
        // The creator is the first player in the list
        isCreator = gameData.players.length > 0 && (gameData.players[0].id === playerId || gameData.players[0].player_id === playerId);
        startGameBtn.style.display = (gameData.status === 'waiting' && isCreator) ? 'block' : 'none';
        startGameBtn.disabled = false;
    }

    // Update game board
    function updateGameBoard() {
        if (!gameData.words) return;

        // Create grid
        crosswordGrid.style.gridTemplateColumns = `repeat(${gameData.cols}, 40px)`;
        crosswordGrid.innerHTML = '';

        // Create cells
        for (let row = 0; row < gameData.rows; row++) {
            for (let col = 0; col < gameData.cols; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.col = col;

                // Add cell number if it's the start of a word
                const cellNumber = getCellNumber(row, col);
                if (cellNumber) {
                    const numberSpan = document.createElement('span');
                    numberSpan.className = 'cell-number';
                    numberSpan.textContent = cellNumber;
                    cell.appendChild(numberSpan);
                }

                // Add event listeners
                cell.addEventListener('click', () => selectCell(cell));
                cell.addEventListener('keydown', handleKeyPress);

                crosswordGrid.appendChild(cell);
            }
        }

        // Update clues
        updateClues();
    }

    // Get cell number for a position
    function getCellNumber(row, col) {
        let number = 1;
        for (const word of gameData.words) {
            if (word.startRow === row && word.startCol === col) {
                return number;
            }
            number++;
        }
        return null;
    }

    // Update clues lists
    function updateClues() {
        acrossClues.innerHTML = '';
        downClues.innerHTML = '';

        let number = 1;
        gameData.words.forEach(word => {
            const li = document.createElement('li');
            li.textContent = `${number}. ${word.hint}`;
            li.dataset.word = word.word;
            li.dataset.direction = word.direction;
            li.dataset.startRow = word.startRow;
            li.dataset.startCol = word.startCol;

            li.addEventListener('click', () => {
                const cell = crosswordGrid.querySelector(
                    `[data-row="${word.startRow}"][data-col="${word.startCol}"]`
                );
                if (cell) {
                    selectCell(cell);
                    selectedDirection = word.direction;
                }
            });

            if (word.direction === 'across') {
                acrossClues.appendChild(li);
            } else {
                downClues.appendChild(li);
            }
            number++;
        });
    }

    // Select a cell
    function selectCell(cell) {
        if (selectedCell) {
            selectedCell.classList.remove('selected');
        }
        selectedCell = cell;
        cell.classList.add('selected');
        cell.focus();

        // Highlight word
        highlightWord(cell);
    }

    // Highlight the current word
    function highlightWord(cell) {
        // Remove previous highlights
        document.querySelectorAll('.cell.highlighted').forEach(cell => {
            cell.classList.remove('highlighted');
        });

        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);

        // Find the word that contains this cell
        const word = gameData.words.find(w => {
            if (w.direction === 'across') {
                return w.startRow === row && col >= w.startCol && col < w.startCol + w.word.length;
            } else {
                return w.startCol === col && row >= w.startRow && row < w.startRow + w.word.length;
            }
        });

        if (word) {
            selectedDirection = word.direction;
            // Highlight all cells in the word
            for (let i = 0; i < word.word.length; i++) {
                const cellRow = word.direction === 'across' ? word.startRow : word.startRow + i;
                const cellCol = word.direction === 'across' ? word.startCol + i : word.startCol;
                const cell = crosswordGrid.querySelector(
                    `[data-row="${cellRow}"][data-col="${cellCol}"]`
                );
                if (cell) {
                    cell.classList.add('highlighted');
                }
            }
        }
    }

    // Handle key press in a cell
    function handleKeyPress(event) {
        if (!selectedCell) return;

        const key = event.key.toUpperCase();
        if (key >= 'A' && key <= 'Z') {
            selectedCell.textContent = key;
            moveToNextCell();
        } else if (event.key === 'Backspace') {
            selectedCell.textContent = '';
            moveToPreviousCell();
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            selectedDirection = 'across';
            moveToNextCell();
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            selectedDirection = 'down';
            moveToNextCell();
        }
    }

    // Move to next cell
    function moveToNextCell() {
        if (!selectedCell) return;

        const row = parseInt(selectedCell.dataset.row);
        const col = parseInt(selectedCell.dataset.col);

        let nextCell;
        if (selectedDirection === 'across') {
            nextCell = crosswordGrid.querySelector(
                `[data-row="${row}"][data-col="${col + 1}"]`
            );
        } else {
            nextCell = crosswordGrid.querySelector(
                `[data-row="${row + 1}"][data-col="${col}"]`
            );
        }

        if (nextCell) {
            selectCell(nextCell);
        }
    }

    // Move to previous cell
    function moveToPreviousCell() {
        if (!selectedCell) return;

        const row = parseInt(selectedCell.dataset.row);
        const col = parseInt(selectedCell.dataset.col);

        let prevCell;
        if (selectedDirection === 'across') {
            prevCell = crosswordGrid.querySelector(
                `[data-row="${row}"][data-col="${col - 1}"]`
            );
        } else {
            prevCell = crosswordGrid.querySelector(
                `[data-row="${row - 1}"][data-col="${col}"]`
            );
        }

        if (prevCell) {
            selectCell(prevCell);
        }
    }

    // Update leaderboard
    function updateLeaderboard() {
        leaderboardList.innerHTML = '';
        const sortedPlayers = [...gameData.players].sort((a, b) => b.points - a.points);
        sortedPlayers.forEach(player => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${player.name}</span>
                <span>${player.points} points</span>
            `;
            leaderboardList.appendChild(li);
        });
    }

    // Update timer display
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

    // Start game button click handler
    startGameBtn.addEventListener('click', () => {
        startGame();
    });

    // Start game function
    function startGame() {
        startGameBtn.disabled = true;
        startGameBtn.textContent = 'Starting...';

        fetch(`/api/puzzle/${puzzleCode}/start/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            }
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.error || 'Failed to start game');
                });
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            // Refresh game data
            fetchPuzzleData();
        })
        .catch(error => {
            console.error('Error:', error);
            showError(error.message || 'Failed to start game');
            startGameBtn.disabled = false;
            startGameBtn.textContent = 'Start Game';
        });
    }

    // Helper function to get CSRF token
    function getCookie(name) {
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

    // Show error message to user
    function showError(message) {
        // Create error message element if it doesn't exist
        let errorDiv = document.querySelector('.error-message');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            document.querySelector('.game-container').insertBefore(
                errorDiv,
                document.querySelector('.game-header')
            );
        }

        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        errorDiv.style.backgroundColor = '#fee2e2';
        errorDiv.style.borderColor = '#ef4444';
        errorDiv.style.color = '#dc2626';
        errorDiv.style.padding = '10px';
        errorDiv.style.margin = '10px 0';
        errorDiv.style.borderRadius = '4px';
        errorDiv.style.textAlign = 'center';

        // Hide message after 5 seconds
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }

    // Update player list
    function updatePlayerList() {
        const playersList = document.getElementById('players-list');
        if (!playersList || !gameData) return;

        // Clear current list
        playersList.innerHTML = '';

        // Add each player to the list
        gameData.players.forEach(player => {
            const li = document.createElement('li');
            li.className = 'player-item';
            
            // Add player name
            const nameSpan = document.createElement('span');
            nameSpan.className = 'player-name';
            nameSpan.textContent = player.display_name || player.name || 'Unnamed';
            
            // Add points
            const pointsSpan = document.createElement('span');
            pointsSpan.className = 'player-points';
            pointsSpan.textContent = `${player.points} points`;
            
            // Add creator badge if this is the first player
            if (gameData.players.indexOf(player) === 0) {
                const creatorBadge = document.createElement('span');
                creatorBadge.className = 'creator-badge';
                creatorBadge.textContent = 'Creator';
                li.appendChild(creatorBadge);
            }
            
            // Add current player indicator
            if (player.id === playerId) {
                li.classList.add('current-player');
            }
            
            li.appendChild(nameSpan);
            li.appendChild(pointsSpan);
            playersList.appendChild(li);
        });
    }

    // Update the crossword grid
    function updateGrid() {
        const gridContainer = document.querySelector('.crossword-grid');
        if (!gridContainer || !gameData) return;

        // Clear existing grid
        gridContainer.innerHTML = '';

        // Create grid
        const grid = document.createElement('div');
        grid.className = 'grid';
        grid.style.gridTemplateColumns = `repeat(${gameData.cols}, 40px)`;
        grid.style.gridTemplateRows = `repeat(${gameData.rows}, 40px)`;

        // Create cells
        for (let i = 0; i < gameData.rows; i++) {
            for (let j = 0; j < gameData.cols; j++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = i;
                cell.dataset.col = j;

                // Determine if this cell is part of any word
                const isWhite = gameData.words.some(word => {
                    if (word.direction === 'across') {
                        return word.start_row === i && j >= word.start_col && j < word.start_col + word.word.length;
                    } else {
                        return word.start_col === j && i >= word.start_row && i < word.start_row + word.word.length;
                    }
                });

                if (isWhite) {
                    // Add cell number if it's the start of a word
                    const cellNumber = getCellNumber(i, j);
                    if (cellNumber) {
                        const numberSpan = document.createElement('span');
                        numberSpan.className = 'cell-number';
                        numberSpan.textContent = cellNumber;
                        cell.appendChild(numberSpan);
                    }

                    // Add input for white cells
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.maxLength = 1;
                    input.dataset.row = i;
                    input.dataset.col = j;
                    input.disabled = false;
                    input.readOnly = false;
                    input.addEventListener('input', handleCellInput);
                    input.addEventListener('keydown', handleCellKeydown);
                    input.addEventListener('click', () => selectCell(input));
                    cell.appendChild(input);
                } else {
                    // Black cell (not part of any word)
                    cell.classList.add('black');
                }

                grid.appendChild(cell);
            }
        }

        gridContainer.appendChild(grid);
    }

    // Get cell number for a position
    function getCellNumber(row, col) {
        if (!gameData || !gameData.words) return null;

        let number = 1;
        for (const word of gameData.words) {
            if (word.start_row === row && word.start_col === col) {
                return number;
            }
            number++;
        }
        return null;
    }

    // Handle cell input
    function handleCellInput(event) {
        const input = event.target;
        const value = input.value.toUpperCase();
        input.value = value;

        // Move to next cell if a letter is entered
        if (value) {
            const nextCell = getNextCell(input);
            if (nextCell) {
                nextCell.focus();
            }
        }
    }

    // Handle cell keydown
    function handleCellKeydown(event) {
        const input = event.target;
        
        switch (event.key) {
            case 'ArrowRight':
                event.preventDefault();
                const nextCell = getNextCell(input);
                if (nextCell) nextCell.focus();
                break;
            case 'ArrowLeft':
                event.preventDefault();
                const prevCell = getPrevCell(input);
                if (prevCell) prevCell.focus();
                break;
            case 'Backspace':
                if (!input.value) {
                    event.preventDefault();
                    const prevCell = getPrevCell(input);
                    if (prevCell) {
                        prevCell.focus();
                        prevCell.value = '';
                    }
                }
                break;
        }
    }

    // Get next cell in current direction
    function getNextCell(currentCell) {
        const row = parseInt(currentCell.dataset.row);
        const col = parseInt(currentCell.dataset.col);
        const direction = selectedDirection;

        if (direction === 'across') {
            return document.querySelector(`input[data-row="${row}"][data-col="${col + 1}"]`);
        } else {
            return document.querySelector(`input[data-row="${row + 1}"][data-col="${col}"]`);
        }
    }

    // Get previous cell in current direction
    function getPrevCell(currentCell) {
        const row = parseInt(currentCell.dataset.row);
        const col = parseInt(currentCell.dataset.col);
        const direction = selectedDirection;

        if (direction === 'across') {
            return document.querySelector(`input[data-row="${row}"][data-col="${col - 1}"]`);
        } else {
            return document.querySelector(`input[data-row="${row - 1}"][data-col="${col}"]`);
        }
    }

    // (Removed duplicate selectCell, findWordAtPosition, and highlightWord functions to resolve conflicts)

    // Initialize the game
    initGame();
});