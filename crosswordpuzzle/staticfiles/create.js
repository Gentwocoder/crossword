document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const rowsInput = document.getElementById('rows');
    const colsInput = document.getElementById('cols');
    const generateGridBtn = document.getElementById('generate-grid');
    const crosswordGrid = document.getElementById('crossword-grid');
    const wordInput = document.getElementById('word');
    const hintInput = document.getElementById('hint');
    const directionSelect = document.getElementById('direction');
    const startRowInput = document.getElementById('start-row');
    const startColInput = document.getElementById('start-col');
    const addWordBtn = document.getElementById('add-word');
    const wordsList = document.getElementById('words-list');
    const previewBtn = document.getElementById('preview-puzzle');
    const generateCodeBtn = document.getElementById('generate-code');
    const puzzleCodeDiv = document.getElementById('puzzle-code');
    const codeInput = document.getElementById('code');
    const copyCodeBtn = document.getElementById('copy-code');
    const templateSelector = document.getElementById('template-selector');
    const useTemplateBtn = document.getElementById('use-template');
    const templatePreviewGrid = document.getElementById('template-preview-grid');

    // --- Grid Import/Upload ---
    const showImportModalBtn = document.getElementById('show-import-modal');
    const importModal = document.getElementById('import-modal');
    const closeImportModalBtn = document.getElementById('close-import-modal');
    const importGridText = document.getElementById('import-grid-text');
    const importGridFile = document.getElementById('import-grid-file');
    const importGridBtn = document.getElementById('import-grid-btn');

    // State
    let grid = [];
    let words = [];
    let selectedCell = null;
    let clueNumbers = [];

    // Populate template selector
    GRID_TEMPLATES.forEach((template, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = template.name;
        templateSelector.appendChild(option);
    });

    // Template preview functionality
    templateSelector.addEventListener('change', function() {
        const selectedIndex = this.value;
        if (selectedIndex === '') {
            templatePreviewGrid.innerHTML = '';
            return;
        }

        const template = GRID_TEMPLATES[selectedIndex];
        templatePreviewGrid.style.gridTemplateColumns = `repeat(${template.cols}, 30px)`;
        templatePreviewGrid.innerHTML = '';

        for (let i = 0; i < template.rows; i++) {
            for (let j = 0; j < template.cols; j++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                if (template.grid[i][j] === 1) {
                    cell.classList.add('black');
                }
                templatePreviewGrid.appendChild(cell);
            }
        }
    });

    // Use template functionality
    useTemplateBtn.addEventListener('click', function() {
        const selectedIndex = templateSelector.value;
        if (selectedIndex === '') {
            showError('Please select a template first');
            return;
        }

        const template = GRID_TEMPLATES[selectedIndex];
        rowsInput.value = template.rows;
        colsInput.value = template.cols;
        generateGrid(template.rows, template.cols, template.grid);
    });

    // Grid Generation
    function generateGrid(rows, cols, existingGrid = null) {
        const grid = document.getElementById('crossword-grid');
        grid.style.gridTemplateColumns = `repeat(${cols}, 40px)`;
        grid.innerHTML = '';

        // Initialize the grid state
        window.grid = Array(rows).fill().map(() => Array(cols).fill(false));

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = i;
                cell.dataset.col = j;
                
                // If we have an existing grid structure, use it
                if (existingGrid && existingGrid[i][j] === 1) {
                    cell.classList.add('black');
                    window.grid[i][j] = true;
                }

                // Only add input for non-black cells
                if (!cell.classList.contains('black')) {
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.maxLength = 1;
                    input.dataset.row = i;
                    input.dataset.col = j;
                    
                    // Add input event handlers
                    input.addEventListener('input', function(e) {
                        // Convert to uppercase
                        this.value = this.value.toUpperCase();
                    });

                    input.addEventListener('keydown', function(e) {
                        const row = parseInt(this.dataset.row);
                        const col = parseInt(this.dataset.col);
                        
                        // Handle arrow keys
                        if (e.key === 'ArrowRight' && col < cols - 1) {
                            const nextInput = document.querySelector(`input[data-row="${row}"][data-col="${col + 1}"]`);
                            if (nextInput && !nextInput.parentElement.classList.contains('black')) {
                                nextInput.focus();
                            }
                        } else if (e.key === 'ArrowLeft' && col > 0) {
                            const prevInput = document.querySelector(`input[data-row="${row}"][data-col="${col - 1}"]`);
                            if (prevInput && !prevInput.parentElement.classList.contains('black')) {
                                prevInput.focus();
                            }
                        } else if (e.key === 'ArrowDown' && row < rows - 1) {
                            const nextInput = document.querySelector(`input[data-row="${row + 1}"][data-col="${col}"]`);
                            if (nextInput && !nextInput.parentElement.classList.contains('black')) {
                                nextInput.focus();
                            }
                        } else if (e.key === 'ArrowUp' && row > 0) {
                            const prevInput = document.querySelector(`input[data-row="${row - 1}"][data-col="${col}"]`);
                            if (prevInput && !prevInput.parentElement.classList.contains('black')) {
                                prevInput.focus();
                            }
                        }
                    });

                    // Add click handler to focus the input
                    cell.addEventListener('click', function() {
                        const input = this.querySelector('input');
                        if (input) {
                            input.focus();
                        }
                    });
                    
                    cell.appendChild(input);
                }
                
                grid.appendChild(cell);
            }
        }

        // Update cell numbers and grid numbering
        updateCellNumbers();
        updateGridNumbering(rows, cols);
    }

    function updateGridNumbering(rows, cols) {
        // Update row numbers
        const rowNumbers = document.querySelector('.row-numbers');
        rowNumbers.innerHTML = '';
        for (let i = 0; i < rows; i++) {
            const rowNumber = document.createElement('div');
            rowNumber.className = 'row-number';
            rowNumber.textContent = i;
            rowNumbers.appendChild(rowNumber);
        }

        // Update column numbers
        const colNumbers = document.querySelector('.col-numbers');
        colNumbers.innerHTML = '';
        for (let i = 0; i < cols; i++) {
            const colNumber = document.createElement('div');
            colNumber.className = 'col-number';
            colNumber.textContent = i;
            colNumbers.appendChild(colNumber);
        }
    }

    function createCell(row, col) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = row;
        cell.dataset.col = col;

        cell.addEventListener('click', () => toggleCell(cell));
        return cell;
    }

    function toggleCell(cell) {
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        
        grid[row][col] = !grid[row][col];
        cell.classList.toggle('black');
        
        // Validate grid after toggle
        validateGrid();
        // Update clue numbers after toggling
        updateClueNumbers();
    }

    // Automatic clue numbering
    function updateClueNumbers() {
        const rows = grid.length;
        const cols = grid[0].length;
        let number = 1;
        clueNumbers = Array(rows).fill().map(() => Array(cols).fill(null));

        // Remove all previous clue numbers
        document.querySelectorAll('.cell-number').forEach(el => el.remove());

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                if (grid[i][j]) continue; // black cell
                // Check if this cell is the start of an across or down word
                const isAcrossStart = (j === 0 || grid[i][j-1]) && (j + 1 < cols && !grid[i][j+1]);
                const isDownStart = (i === 0 || grid[i-1][j]) && (i + 1 < rows && !grid[i+1][j]);
                if (isAcrossStart || isDownStart) {
                    clueNumbers[i][j] = number;
                    // Add number to cell
                    const cell = document.querySelector(`.cell[data-row="${i}"][data-col="${j}"]`);
                    if (cell) {
                        const numDiv = document.createElement('div');
                        numDiv.className = 'cell-number';
                        numDiv.textContent = number;
                        cell.appendChild(numDiv);
                    }
                    number++;
                }
            }
        }
    }

    // Word Input Functionality
    document.getElementById('add-word').addEventListener('click', () => {
        const word = document.getElementById('word').value.trim().toUpperCase();
        const hint = document.getElementById('hint').value.trim();
        const direction = document.getElementById('direction').value;
        const startRow = parseInt(document.getElementById('start-row').value);
        const startCol = parseInt(document.getElementById('start-col').value);

        if (!word || !hint) {
            showError('Please enter both word and hint');
            return;
        }

        if (isNaN(startRow) || isNaN(startCol)) {
            showError('Please enter valid start position');
            return;
        }

        // Validate word placement
        const grid = document.getElementById('crossword-grid');
        const cells = grid.getElementsByClassName('cell');
        const cols = parseInt(document.getElementById('cols').value);

        // Check if word fits in the grid
        if (direction === 'across' && startCol + word.length > cols) {
            showError('Word does not fit in the grid horizontally');
            return;
        }
        if (direction === 'down' && startRow + word.length > parseInt(document.getElementById('rows').value)) {
            showError('Word does not fit in the grid vertically');
            return;
        }

        // Check if cells are available
        for (let i = 0; i < word.length; i++) {
            const row = direction === 'across' ? startRow : startRow + i;
            const col = direction === 'across' ? startCol + i : startCol;
            const cellIndex = row * cols + col;
            
            if (cellIndex >= cells.length || cells[cellIndex].classList.contains('black')) {
                showError('Word cannot be placed on black cells');
                return;
            }
        }

        // Add word to the list
        const wordList = document.getElementById('words-list');
        const listItem = document.createElement('li');
        listItem.className = 'word-item';
        
        const wordText = document.createElement('span');
        wordText.className = 'word-text';
        wordText.textContent = `${word} (${direction}) - ${hint}`;
        
        const removeButton = document.createElement('button');
        removeButton.className = 'remove-word';
        removeButton.textContent = 'Remove';
        
        // Store word data for removal and code generation
        listItem.dataset.word = word;
        listItem.dataset.direction = direction;
        listItem.dataset.startRow = startRow;
        listItem.dataset.startCol = startCol;
        listItem.dataset.hint = hint;
        
        removeButton.addEventListener('click', () => {
            // Remove word from grid
            const cols = parseInt(document.getElementById('cols').value);
            for (let i = 0; i < word.length; i++) {
                const row = direction === 'across' ? startRow : startRow + i;
                const col = direction === 'across' ? startCol + i : startCol;
                const cellIndex = row * cols + col;
                const input = cells[cellIndex].querySelector('input');
                input.value = '';
            }
            
            // Remove word from list
            listItem.remove();
            
            // Update cell numbers
            updateCellNumbers();
        });
        
        listItem.appendChild(wordText);
        listItem.appendChild(removeButton);
        wordList.appendChild(listItem);

        // Place word in the grid
        for (let i = 0; i < word.length; i++) {
            const row = direction === 'across' ? startRow : startRow + i;
            const col = direction === 'across' ? startCol + i : startCol;
            const cellIndex = row * cols + col;
            const input = cells[cellIndex].querySelector('input');
            input.value = word[i];
        }

        // Clear input fields
        document.getElementById('word').value = '';
        document.getElementById('hint').value = '';
        document.getElementById('start-row').value = '';
        document.getElementById('start-col').value = '';

        // Update cell numbers
        updateCellNumbers();
    });

    // Word Management
    function addWord() {
        const word = wordInput.value.trim().toUpperCase();
        const hint = hintInput.value.trim();
        const direction = directionSelect.value;
        const startRow = parseInt(startRowInput.value);
        const startCol = parseInt(startColInput.value);

        if (!validateWordInput(word, hint, startRow, startCol)) {
            return;
        }

        // Check if word fits in grid
        if (!canPlaceWord(word, direction, startRow, startCol)) {
            showError('Word cannot be placed at the specified position');
            return;
        }

        // Add word to list
        const wordObj = { word, hint, direction, startRow, startCol };
        words.push(wordObj);
        updateWordsList();
        placeWordInGrid(wordObj);

        // Clear inputs
        clearWordInputs();
    }

    function canPlaceWord(word, direction, startRow, startCol) {
        const length = word.length;
        const rows = grid.length;
        const cols = grid[0].length;

        if (direction === 'across') {
            if (startCol + length > cols) return false;
            for (let i = 0; i < length; i++) {
                if (grid[startRow][startCol + i]) return false;
            }
        } else {
            if (startRow + length > rows) return false;
            for (let i = 0; i < length; i++) {
                if (grid[startRow + i][startCol]) return false;
            }
        }
        return true;
    }

    function placeWordInGrid(wordObj) {
        const { word, direction, startRow, startCol } = wordObj;
        
        for (let i = 0; i < word.length; i++) {
            const row = direction === 'across' ? startRow : startRow + i;
            const col = direction === 'across' ? startCol + i : startCol;
            grid[row][col] = true;
            
            const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
            cell.classList.remove('black');
        }
        updateClueNumbers();
    }

    function updateWordsList() {
        wordsList.innerHTML = '';
        words.forEach((word, index) => {
            const li = document.createElement('li');
            const wordSpan = document.createElement('span');
            wordSpan.textContent = `${word.word} (${word.direction})`;
            
            const removeBtn = document.createElement('button');
            removeBtn.textContent = 'Remove';
            removeBtn.addEventListener('click', () => removeWord(index));
            
            li.appendChild(wordSpan);
            li.appendChild(removeBtn);
            wordsList.appendChild(li);
        });
    }

    function removeWord(index) {
        // Remove the word from the array
        words.splice(index, 1);
        
        // Update the words list display
        updateWordsList();
        
        // Regenerate the grid to reflect the changes
        regenerateGrid();
        
        // Show success message
        showError('Word removed successfully');
    }

    function regenerateGrid() {
        // Clear grid
        grid = Array(grid.length).fill().map(() => Array(grid[0].length).fill(false));
        
        // Reset all cells
        document.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('black');
            cell.textContent = '';
        });

        // Place all words again
        words.forEach(word => placeWordInGrid(word));
        // Update clue numbers
        updateClueNumbers();
    }

    // Validation
    function validateGridSize(rows, cols) {
        if (isNaN(rows) || isNaN(cols)) {
            showError('Please enter valid numbers for rows and columns');
            return false;
        }
        if (rows < 5 || rows > 15 || cols < 5 || cols > 15) {
            showError('Grid size must be between 5x5 and 15x15');
            return false;
        }
        return true;
    }

    function validateWordInput(word, hint, startRow, startCol) {
        if (!word) {
            showError('Please enter a word');
            return false;
        }
        if (!/^[A-Z]+$/.test(word)) {
            showError('Word must contain only letters');
            return false;
        }
        if (!hint) {
            showError('Please enter a hint');
            return false;
        }
        if (isNaN(startRow) || isNaN(startCol)) {
            showError('Please enter valid starting position');
            return false;
        }
        return true;
    }

    function validateGrid() {
        // Check for isolated cells
        const rows = grid.length;
        const cols = grid[0].length;
        let hasIsolatedCells = false;

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                if (!grid[i][j]) {
                    const hasNeighbor = (
                        (i > 0 && !grid[i-1][j]) ||
                        (i < rows-1 && !grid[i+1][j]) ||
                        (j > 0 && !grid[i][j-1]) ||
                        (j < cols-1 && !grid[i][j+1])
                    );
                    if (!hasNeighbor) {
                        hasIsolatedCells = true;
                        break;
                    }
                }
            }
        }

        if (hasIsolatedCells) {
            showError('Grid contains isolated cells');
        }
    }

    // Utility Functions
    function showError(message, type = 'error') {
        // Create error message element if it doesn't exist
        let messageDiv = document.querySelector('.error-message');
        if (!messageDiv) {
            messageDiv = document.createElement('div');
            messageDiv.className = 'error-message';
            document.querySelector('.puzzle-creator').insertBefore(
                messageDiv,
                document.querySelector('.grid-size-selector')
            );
        }
        
        messageDiv.textContent = message;
        messageDiv.style.display = 'block';
        
        // Update styling based on message type
        if (type === 'success') {
            messageDiv.style.backgroundColor = '#d4edda';
            messageDiv.style.borderColor = '#c3e6cb';
            messageDiv.style.color = '#155724';
        } else {
            messageDiv.style.backgroundColor = '#fee2e2';
            messageDiv.style.borderColor = '#ef4444';
            messageDiv.style.color = '#dc2626';
        }
        
        // Hide message after 3 seconds
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 3000);
    }

    function clearWordInputs() {
        wordInput.value = '';
        hintInput.value = '';
        startRowInput.value = '';
        startColInput.value = '';
    }

    // Preview functionality
    function previewPuzzle() {
        const grid = document.getElementById('crossword-grid');
        const cells = grid.getElementsByClassName('cell');
        const wordsList = document.getElementById('words-list');
        
        if (wordsList.children.length === 0) {
            showImportError('Please add at least one word to preview the puzzle');
            return;
        }

        // Create preview modal
        const previewModal = document.createElement('div');
        previewModal.className = 'modal';
        previewModal.innerHTML = `
            <div class="modal-content preview-content">
                <span class="close-modal" id="close-preview-modal">&times;</span>
                <h2>Puzzle Preview</h2>
                <div class="preview-container">
                    <div class="preview-grid"></div>
                    <div class="preview-clues">
                        <div class="across-clues">
                            <h3>Across</h3>
                            <ol id="preview-across"></ol>
                        </div>
                        <div class="down-clues">
                            <h3>Down</h3>
                            <ol id="preview-down"></ol>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Clone the grid for preview
        const previewGrid = previewModal.querySelector('.preview-grid');
        previewGrid.style.gridTemplateColumns = `repeat(${document.getElementById('cols').value}, 40px)`;
        
        Array.from(cells).forEach(cell => {
            const previewCell = document.createElement('div');
            previewCell.className = cell.className;
            if (cell.classList.contains('black')) {
                previewCell.classList.add('black');
            } else {
                const number = cell.querySelector('.cell-number');
                if (number) {
                    const numberSpan = document.createElement('span');
                    numberSpan.className = 'cell-number';
                    numberSpan.textContent = number.textContent;
                    previewCell.appendChild(numberSpan);
                }
            }
            previewGrid.appendChild(previewCell);
        });

        // Add clues to preview
        const acrossClues = previewModal.querySelector('#preview-across');
        const downClues = previewModal.querySelector('#preview-down');
        let clueNumber = 1;

        Array.from(wordsList.children).forEach(wordItem => {
            const wordText = wordItem.querySelector('.word-text').textContent;
            const [word, direction, hint] = wordText.split(' - ');
            const [wordOnly, dir] = word.split(' (');
            
            const clueItem = document.createElement('li');
            clueItem.textContent = `${clueNumber}. ${hint}`;
            
            if (direction === 'across') {
                acrossClues.appendChild(clueItem);
            } else {
                downClues.appendChild(clueItem);
            }
            clueNumber++;
        });

        // Add modal to page
        document.body.appendChild(previewModal);

        // Close modal functionality
        const closeButton = previewModal.querySelector('#close-preview-modal');
        closeButton.addEventListener('click', () => {
            previewModal.remove();
        });

        // Close modal when clicking outside
        previewModal.addEventListener('click', (e) => {
            if (e.target === previewModal) {
                previewModal.remove();
            }
        });
    }

    // Puzzle code generation
    function generatePuzzleCode() {
        // Get all words from the words list
        const wordElements = document.querySelectorAll('#words-list .word-item');
        if (wordElements.length === 0) {
            showError('Please add at least one word to generate a puzzle code');
            return;
        }

        // Get game duration
        const duration = parseInt(document.getElementById('game-duration').value);
        if (isNaN(duration) || duration < 1 || duration > 120) {
            showError('Please enter a valid game duration (1-120 minutes)');
            return;
        }

        // Collect words data
        const words = Array.from(wordElements).map(wordItem => {
            const wordData = {
                word: wordItem.dataset.word,
                hint: wordItem.dataset.hint,
                direction: wordItem.dataset.direction,
                startRow: parseInt(wordItem.dataset.startRow),
                startCol: parseInt(wordItem.dataset.startCol)
            };
            
            console.log('Processed word data:', wordData); // Debug log
            return wordData;
        });

        // Get grid dimensions
        const rows = parseInt(document.getElementById('rows').value);
        const cols = parseInt(document.getElementById('cols').value);

        // Validate data
        if (isNaN(rows) || isNaN(cols)) {
            showError('Invalid grid dimensions');
            return;
        }

        if (rows < 5 || rows > 15 || cols < 5 || cols > 15) {
            showError('Grid dimensions must be between 5x5 and 15x15');
            return;
        }

        // Create puzzle data
        const puzzleData = {
            rows: rows,
            cols: cols,
            words: words,
            duration: duration
        };

        console.log('Sending puzzle data:', puzzleData); // Debug log

        // Show loading state
        const generateCodeBtn = document.getElementById('generate-code');
        const originalText = generateCodeBtn.textContent;
        generateCodeBtn.textContent = 'Generating...';
        generateCodeBtn.disabled = true;

        // Send data to server
        function getCSRFToken() {
            const name = 'csrftoken';
            const cookies = document.cookie.split(';');
            for (let cookie of cookies) {
                const [key, value] = cookie.trim().split('=');
                if (key === name) return decodeURIComponent(value);
            }
            return null;
        }

        fetch('/api/create-puzzle/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify(puzzleData)
        })
        .then(response => {
            console.log('Response status:', response.status); // Debug log
            if (!response.ok) {
                return response.json().then(data => {
                    console.log('Error response:', data); // Debug log
                    throw new Error(data.error || 'Failed to generate puzzle code');
                });
            }
            return response.json();
        })
        .then(data => {
            console.log('Success response:', data); // Debug log
            if (data.code) {
                // Show the code
                const codeInput = document.getElementById('code');
                const puzzleCodeDiv = document.getElementById('puzzle-code');
                codeInput.value = data.code;
                puzzleCodeDiv.classList.remove('hidden');

                // Store preview data in session storage
                sessionStorage.setItem('puzzlePreview', JSON.stringify(puzzleData));

                // Show success message
                showError('Puzzle code generated successfully!', 'success');
            } else {
                throw new Error(data.error || 'Failed to generate puzzle code');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showError(error.message || 'Failed to generate puzzle code');
        })
        .finally(() => {
            // Reset button state
            generateCodeBtn.textContent = originalText;
            generateCodeBtn.disabled = false;
        });
    }

    // Utility function to get CSRF token
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

    // Event Listeners
    generateGridBtn.addEventListener('click', () => {
        const rows = parseInt(rowsInput.value);
        const cols = parseInt(colsInput.value);
        generateGrid(rows, cols);
    });
    addWordBtn.addEventListener('click', addWord);
    
    previewBtn.addEventListener('click', previewPuzzle);
    generateCodeBtn.addEventListener('click', generatePuzzleCode);

    copyCodeBtn.addEventListener('click', () => {
        codeInput.select();
        document.execCommand('copy');
        showError('Code copied to clipboard!');
    });

    showImportModalBtn.addEventListener('click', () => {
        importModal.classList.remove('hidden');
    });
    closeImportModalBtn.addEventListener('click', () => {
        importModal.classList.add('hidden');
        importGridText.value = '';
        importGridFile.value = '';
    });

    function showImportError(message) {
        const errorElement = document.getElementById('import-error');
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
    }

    function hideImportError() {
        const errorElement = document.getElementById('import-error');
        errorElement.classList.add('hidden');
    }

    document.getElementById('import-grid-btn').addEventListener('click', () => {
        const gridText = document.getElementById('import-grid-text').value.trim();
        if (!gridText) {
            showImportError('Please enter or upload a grid structure');
            return;
        }

        // Parse the grid text
        const rows = gridText.split('\n').map(row => row.trim()).filter(row => row);
        if (rows.length === 0) {
            showImportError('Invalid grid format');
            return;
        }

        try {
            // Validate and parse each row
            const grid = rows.map(row => {
                const cells = row.split(/\s+/).filter(cell => cell);
                return cells.map(cell => {
                    if (cell === '.' || cell === '0') return 0;
                    if (cell === '#' || cell === '1') return 1;
                    throw new Error('Invalid cell value');
                });
            });

            // Validate grid dimensions
            const numCols = grid[0].length;
            if (!grid.every(row => row.length === numCols)) {
                showImportError('All rows must have the same number of columns');
                return;
            }

            // Update the grid size inputs
            document.getElementById('rows').value = grid.length;
            document.getElementById('cols').value = numCols;

            // Generate the grid with the imported structure
            generateGrid(grid.length, numCols, grid);

            // Close the modal and clear inputs
            document.getElementById('import-modal').classList.add('hidden');
            document.getElementById('import-grid-text').value = '';
            document.getElementById('import-grid-file').value = '';
            hideImportError();
        } catch (error) {
            showImportError('Invalid cell value. Use . or 0 for white cells, # or 1 for black cells.');
        }
    });

    // Clear error when modal is closed
    document.getElementById('close-import-modal').addEventListener('click', () => {
        document.getElementById('import-modal').classList.add('hidden');
        hideImportError();
    });

    // Clear error when new file is selected
    document.getElementById('import-grid-file').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('import-grid-text').value = e.target.result;
                hideImportError();
            };
            reader.readAsText(file);
        }
    });

    // Initialize
    generateGrid();
}); 