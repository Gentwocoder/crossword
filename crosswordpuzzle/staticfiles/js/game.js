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
        initializeGrid();
        initializeClues();
        // Poll for updates every 5 seconds without showing loader
        setInterval(() => fetchPuzzleData(true), 5000);
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
            updatePlayerList();
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

        //Update player list
        // updatePlayerList();

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
    // function updateStartButton() {
    //     if (!startGameBtn || !gameData || !gameData.players) return;
    //     // The creator is the first player in the list
    //     isCreator = gameData.players.length > 0 && (gameData.players[0].id === playerId || gameData.players[0].player_id === playerId);
    //     console.log(`Is creator: ${isCreator}`);
    //     startGameBtn.style.display = (gameData.status === 'waiting' && isCreator) ? 'block' : 'none';
    //     startGameBtn.disabled = false;

    // }

    function updateStartButton() {
        if (!startGameBtn || !gameData || !gameData.players) return;
         // Find the current player in the list
        const currentPlayer = gameData.players.find(
            p => String(p.id) === String(playerId) || String(p.player_id) === String(playerId)
        );
        const isCreator = currentPlayer && currentPlayer.is_creator;
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

    // (Removed duplicate selectCell, findWordAtPosition, and highlightWord functions to resolve conflicts)

    // Initialize the game
    initGame();
});