console.log("Kotoba Web Quiz loading...");

// Stub wanakana (Japanese-specific) functions to safely remove dependency
const wanakana = { isKanji: () => false, toKana: (str) => str };

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const questionEl = document.getElementById('question');
    const answerInputEl = document.getElementById('answer-input');
    const feedbackEl = document.getElementById('feedback');
    const deckSelectorEl = document.getElementById('deck-selector');
    const quizContainerEl = document.getElementById('quiz-container');
    const modeSwitch = document.getElementById('mode-switch');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const sidePanel = document.getElementById('side-panel');
    const statsBtn = document.getElementById('stats-btn');
    const statsModal = document.getElementById('stats-modal');
    const statsDisplay = document.getElementById('stats-display');
    const closeModalBtn = document.querySelector('.close-btn');
    const decompositionDisplay = document.getElementById('decomposition-display');
    const statsContainer = document.getElementById('stats-container');
    const germanExampleEl = document.getElementById('german-example');
    
    // --- Pokemon Mode Elements ---
    const pokemonModeToggleEl = document.getElementById('pokemon-mode-toggle');
    const pokemonModeContainerEl = document.getElementById('pokemon-mode');
    const pokemonCatcherEl = document.getElementById('pokemon-catcher');
    const pokemonImageEl = document.getElementById('pokemon-image');
    const pokemonNameEl = document.getElementById('pokemon-name');
    const pokedexBtn = document.getElementById('pokedex-btn');
    const pokedexModal = document.getElementById('pokedex-modal');
    const pokedexCloseBtn = document.getElementById('pokedex-close-btn');
    const pokedexGrid = document.getElementById('pokedex-grid');
    const pokedexStatsEl = document.getElementById('pokedex-stats');
    const savePokedexBtn = document.getElementById('save-pokedex-btn');
    const loadPokedexBtn = document.getElementById('load-pokedex-btn');
    const loadPokedexInput = document.getElementById('load-pokedex-input');
    const pokedexSearchEl = document.getElementById('pokedex-search');
    const pokedexFiltersEl = document.getElementById('pokedex-filters');
    const pokedexModalContent = document.getElementById('pokedex-modal-content');
    const pokedexHeaderEl = document.getElementById('pokedex-header');
    const pokedexResizerEl = document.getElementById('pokedex-resizer');

    // --- Stats & Storage ---
    const STATS_KEY = 'kotobaStats';
    const POKEDEX_KEY = 'kotobaPokedex';
    const getStats = () => JSON.parse(localStorage.getItem(STATS_KEY)) || {};
    const saveStats = (stats) => localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    const getPokedex = () => JSON.parse(localStorage.getItem(POKEDEX_KEY)) || [];
    const savePokedexToStorage = (pokedex) => localStorage.setItem(POKEDEX_KEY, JSON.stringify(pokedex));

    // --- Quiz State ---
    const quizState = {
        deck: [],
        upcomingCards: [],
        currentCard: null,
        mode: 'conquest',
        score: 0,
        questionsAnswered: 0,
        deckName: null,
        isShowingAnswer: false,
        decompositionCache: {},
        hidePopupTimeout: null,
        kanjiToIdMap: null,
        currentCardHasBeenGivenUp: false,
        decks: [],
        sessionStatsRecorded: false,
        conquestModePercentCorrectThreshold: 0.76,
        conquestModeSpacingModifier: 1.0,
        // --- Pokemon Mode State ---
        pokemonModeActive: false,
        allPokemon: [],
        pokedex: getPokedex(), // Array of caught pokemon IDs
        wildPokemon: null, // The currently spawned pokemon
        pokedexLoaded: false,
        pokedexFilter: 'all', // 'all', 'caught', 'missing'
        pokedexSearchTerm: '',
        typingAnimationInterval: null,
    };

    const WK_RADICALS_BASE_URL = 'https://raw.githubusercontent.com/jmle/wkradicals/1e84bab91424aebf67862a77a58e6a111900be8f/data';
    const POKE_API_BASE_URL = 'https://pokeapi.co/api/v2';
    const TOTAL_POKEMON = 1025; // As of Gen 9
    const SAVE_KEY = 'k0t0b@_p0k3d3x_s@v3_d@t@'; // For "encryption"

    // --- Conquest Mode SRS Logic ---
    const indexTopForStreakLength = { 0: 16, 1: 35, 2: 80, 3: 140, 4: 200, 5: 300, 6: 400, length: 7 };
    function calculateStreakLength(card) {
      let streakLength = 0;
      for (let i = card.answerHistory.length - 1; i >= 0; i -= 1) {
        if (card.answerHistory[i]) {
          ++streakLength;
        } else {
          break;
        }
      }
      return streakLength;
    }
    const calculateIndexTop = (streak) => indexTopForStreakLength[streak] || indexTopForStreakLength[indexTopForStreakLength.length - 1] * (streak - indexTopForStreakLength.length + 2);

    function calculatePercentCorrect(card) {
      if (!card.answerHistory || card.answerHistory.length === 0) {
        return 0;
      }
      let numberCorrect = card.answerHistory.reduce((a, b) => b ? a + 1 : a , 0);
      let percentCorrect = numberCorrect / card.answerHistory.length;
      return percentCorrect;
    }

    function recycleCard(card) {
        if (calculatePercentCorrect(card) >= quizState.conquestModePercentCorrectThreshold && card.answerHistory[card.answerHistory.length - 1]) {
            // Card is retired, do not recycle
            return;
        }

        const streakLength = calculateStreakLength(card);
        const indexTop = calculateIndexTop(streakLength);
        
        const randomFactor = Math.random() * 0.40 + 0.60;
        const newDistanceFromFront = Math.floor(indexTop * quizState.conquestModeSpacingModifier * randomFactor);
        
        let index = quizState.upcomingCards.length - 1 - newDistanceFromFront;

        if (index < 0) {
          index = quizState.upcomingCards.length - 1 - Math.floor(newDistanceFromFront / 2);
          if (index < 0) {
            if (card.answerHistory[card.answerHistory.length - 1]) {
              // If correct and can't be placed, it graduates
              return;
            } else {
              // If incorrect and can't be placed, put it at the start of the upcoming cards (after the current one)
              index = 1;
            }
          }
        }
        
        quizState.upcomingCards.splice(Math.max(1, index), 0, card);
    }

    // --- Core Quiz Logic ---
    function displayQuestion() {
        quizState.isShowingAnswer = false;
        answerInputEl.disabled = false;
        answerInputEl.value = '';
        answerInputEl.focus();

        let card;
        if (quizState.mode === 'normal') {
            card = quizState.upcomingCards[quizState.questionsAnswered];
        } else { // conquest
            card = quizState.upcomingCards[0];
        }

        questionEl.innerHTML = ''; // Clear previous question
        
        if (card) {
            quizState.currentCard = card;
            // Directly set the question text without kanji-specific handling
            questionEl.textContent = quizState.currentCard.question;

            questionEl.classList.remove('faded');
            germanExampleEl.classList.remove('faded');

            // Prepare and display the German example sentence with highlighted keyword
            if (card.germanExample) {
                // Build a list of candidate keywords to highlight (remove punctuation & articles)
                const rawKeywords = card.question.split(/[,;()]/)[0].trim().split(/\s+/);
                const articles = ['der', 'die', 'das', 'ein', 'eine', 'einen', 'einem', 'einer', 'dem', 'den', 'des'];
                const keywords = rawKeywords.filter(w => !articles.includes(w.toLowerCase()));

                const highlightedSentence = highlightSentence(card.germanExample, keywords);
                germanExampleEl.innerHTML = highlightedSentence;
                germanExampleEl.style.display = 'block';
            } else {
                germanExampleEl.innerHTML = '';
                germanExampleEl.style.display = 'none';
            }
        } else {
             if (quizState.deck.length > 0) {
                questionEl.textContent = 'Quiz Finished!';
                germanExampleEl.innerHTML = '';
                germanExampleEl.style.display = 'none';
                answerInputEl.style.display = 'none';
                const percentage = quizState.questionsAnswered > 0 ? Math.round((quizState.score / quizState.questionsAnswered) * 100) : 0;
                feedbackEl.textContent = `Final score: ${quizState.score}/${quizState.questionsAnswered} (${percentage}%)`;
                feedbackEl.className = 'visible';
            }
        }
    }
    
    function showAndAdvance(isCorrect, givenUp = false) {
        quizState.isShowingAnswer = true;
        answerInputEl.disabled = true;

        let meaning = quizState.currentCard.meaning || '';
        const meaningParts = meaning.split(';').map(s => s.trim());
        if (meaningParts.length > 3) {
            meaning = meaningParts.slice(0, 3).join('; ') + '...';
        } else {
            meaning = meaningParts.join('; ');
        }
        const meaningHTML = `<br><span style="font-size: 1.5rem; color: var(--subtle-text);">${meaning}</span>`;

        if (isCorrect) {
            if (!quizState.currentCardHasBeenGivenUp) {
                quizState.score++;
            }
            feedbackEl.innerHTML = `Correct!${meaningHTML}`;
            feedbackEl.className = 'correct';
            answerInputEl.value = '';
        } else {
            const primaryAnswer = quizState.currentCard.answer[0];
            feedbackEl.innerHTML = `${primaryAnswer}${meaningHTML}`;
            feedbackEl.className = 'incorrect';
        }
        
        feedbackEl.classList.add('visible');
        quizState.questionsAnswered++;
        updateStats(isCorrect && !quizState.currentCardHasBeenGivenUp);

        // --- Pokemon Mode Logic ---
        if (quizState.pokemonModeActive && isCorrect) {
            // A pokemon was already there, so this correct answer catches it
            if (quizState.wildPokemon) {
                catchPokemon(quizState.wildPokemon);
            } else {
                 // If no pokemon was there, spawn a new one
                spawnPokemon();
            }
        } else if (quizState.pokemonModeActive && !isCorrect) {
            // You failed to catch it
            if (quizState.wildPokemon) {
                const fledPokemonName = quizState.wildPokemon.name;
                pokemonNameEl.classList.remove('caught-text');
                typeAnimation(pokemonNameEl, `The wild ${fledPokemonName} fled...`);
                pokemonImageEl.classList.remove('visible');
                quizState.wildPokemon = null;
            }
        }

        if (quizState.mode === 'conquest') {
            quizState.currentCard.answerHistory.push(isCorrect);
            recycleCard(quizState.currentCard);
        }
        
        // PAUSE HERE until user presses Enter again.
        // if (isCorrect) {
        //     setTimeout(() => nextQuestion(), 500);
        // }
    }

    function checkAnswer() {
        if (quizState.isShowingAnswer) return;

        const userAnswer = answerInputEl.value.trim();
        if (!userAnswer || !quizState.currentCard) return;

        if (userAnswer === '.') {
            quizState.currentCardHasBeenGivenUp = true;
            showAndAdvance(false, true); // give up
            return;
        }

        const isCorrect = quizState.currentCard.answer.some(a => a.toLowerCase() === userAnswer.toLowerCase());
        
        if (isCorrect) {
            showAndAdvance(true);
        }
    }

    function nextQuestion() {
        // Start fading out both elements simultaneously
        questionEl.classList.add('faded');
        germanExampleEl.classList.add('faded');
        feedbackEl.classList.remove('visible');
        quizState.currentCardHasBeenGivenUp = false;

        // Wait for the animation to finish before showing the next question
        setTimeout(() => {
            // Clear feedback content AFTER it has faded out
            feedbackEl.innerHTML = '';
            feedbackEl.className = '';

            if (quizState.mode === 'conquest') {
                quizState.upcomingCards.shift();
                if (quizState.upcomingCards.length === 0) {
                    quizState.currentCard = null;
                }
            }
            displayQuestion();
        }, 300); // This timeout should match the CSS transition duration
    }

    async function startQuiz(deckName, mode) {
        const loadedDeck = await loadDeck(deckName);
        if (loadedDeck.length === 0) {
            questionEl.textContent = 'Select a deck';
            return;
        };

        quizContainerEl.style.opacity = 1;
        answerInputEl.style.display = 'block';
        statsContainer.style.display = 'block';
        if (quizState.pokemonModeActive) {
            pokemonCatcherEl.style.display = 'flex';
        }

        quizState.deck = loadedDeck;
        quizState.deckName = deckName;
        quizState.mode = mode;
        quizState.score = 0;
        quizState.questionsAnswered = 0;
        quizState.upcomingCards = [...quizState.deck];
        quizState.sessionStatsRecorded = false;
        shuffleArray(quizState.upcomingCards);
        
        if (mode === 'conquest') {
            quizState.deck.forEach(card => card.answerHistory = []);
        }

        // Reset pokemon state on new quiz start
        quizState.wildPokemon = null;
        pokemonCatcherEl.classList.remove('visible');

        updateStatsDisplay();
        displayQuestion();
    }
    
    // --- Kanji Decomposition ---
    async function getDecomposition(character) {
        if (quizState.decompositionCache[character]) {
            if (!quizState.decompositionCache[character].error) {
                 return quizState.decompositionCache[character];
            }
        }
    
        if (!quizState.kanjiToIdMap) {
            console.error("Kanji to ID map not loaded yet.");
            return { error: true, message: "Map not loaded." };
        }
    
        const kanjiId = quizState.kanjiToIdMap[character];
        if (!kanjiId) {
            console.warn(`No ID found for kanji: ${character}`);
            return { error: true, message: "Kanji not in decomposition dictionary." };
        }
    
        try {
            const kanjiRes = await fetchWithRetries(`${WK_RADICALS_BASE_URL}/kanji/${kanjiId}.json`);
            if (!kanjiRes.ok) throw new Error(`Failed to fetch kanji data for ${character}`);
            const kanjiData = await kanjiRes.json();
    
            const { primaryMeaning, meaningMnemonic, related } = kanjiData;
            const radicalIds = related?.radicals || [];
    
            const radicalPromises = radicalIds.map(id => 
                fetchWithRetries(`${WK_RADICALS_BASE_URL}/subjects/${id}.json`).then(res => res.json())
            );
            const radicalDataArray = await Promise.all(radicalPromises);
    
            const radicals = radicalDataArray.map(radData => ({
                character: radData.characters?.value || '?',
                meaning: radData.primaryMeaning,
            }));
    
            const result = {
                kanjiMeaning: primaryMeaning,
                meaningMnemonic,
                radicals,
            };
            
            quizState.decompositionCache[character] = result;
            return result;
    
        } catch (e) {
            console.error(`Error fetching decomposition for ${character}:`, e);
            quizState.decompositionCache[character] = { error: true, message: e.message };
            return quizState.decompositionCache[character];
        }
    }

    async function updateDecompositionPopup(character) {
        const data = await getDecomposition(character);
    
        if (!data || data.error) {
            const message = data?.message || 'Decomposition not available.';
            decompositionDisplay.innerHTML = `<div class="radical-container"><span class="radical-meaning">${message}</span></div>`;
            if (data?.error) {
                delete quizState.decompositionCache[character];
            }
            return;
        }
    
        decompositionDisplay.innerHTML = '';
    
        const radicalsContainer = document.createElement('div');
        radicalsContainer.className = 'radicals-list';
        data.radicals.forEach(rad => {
            const radicalContainer = document.createElement('div');
            radicalContainer.className = 'radical-container';
    
            const radicalCharSpan = document.createElement('span');
            radicalCharSpan.className = 'radical-char';
            radicalCharSpan.textContent = rad.character;
    
            const radicalMeaningSpan = document.createElement('span');
            radicalMeaningSpan.className = 'radical-meaning';
            radicalMeaningSpan.textContent = rad.meaning;
    
            radicalContainer.appendChild(radicalCharSpan);
            radicalContainer.appendChild(radicalMeaningSpan);
            radicalsContainer.appendChild(radicalContainer);
        });
        decompositionDisplay.appendChild(radicalsContainer);
    
        if (data.meaningMnemonic) {
            const mnemonicP = document.createElement('p');
            mnemonicP.className = 'mnemonic';
            const formattedMnemonic = data.meaningMnemonic
                .replace(/<radical>(.*?)<\/radical>/g, '<span class="mnemonic-radical">$1</span>')
                .replace(/<kanji>(.*?)<\/kanji>/g, '<span class="mnemonic-kanji-meaning">$1</span>');
            mnemonicP.innerHTML = formattedMnemonic;
            decompositionDisplay.appendChild(mnemonicP);
        }
    }

    async function showDecomposition(character, targetElement) {
        clearTimeout(quizState.hidePopupTimeout);
        
        decompositionDisplay.classList.remove('hidden');

        // Show loading indicator ONLY if data is not already cached
        if (!quizState.decompositionCache[character]) {
            decompositionDisplay.innerHTML = '<div class="radical-container"><span class="radical-meaning">Loading...</span></div>';
        }

        // Now update with actual data. This will be instant if preloaded.
        await updateDecompositionPopup(character);
    }

    function hideDecomposition() {
        quizState.hidePopupTimeout = setTimeout(() => {
            decompositionDisplay.classList.add('hidden');
        }, 300);
    }
    
    // --- Data & UI ---

    // Helper function for retrying fetch
    async function fetchWithRetries(url, options, retries = 3, delay = 500) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, options);
                // Retry on 5xx server errors
                if (response.status >= 500 && response.status < 600) {
                    throw new Error(`Server error: ${response.status}`);
                }
                return response; // Success
            } catch (error) {
                if (i < retries - 1) {
                    console.warn(`Fetch attempt ${i + 1} failed. Retrying in ${delay}ms...`, error.message);
                    await new Promise(res => setTimeout(res, delay));
                } else {
                    throw error; // Rethrow last error
                }
            }
        }
    }

    async function getDecompositionFromApi(character) {
        if (quizState.decompositionCache[character]) {
            // Don't return error objects from the cache, re-fetch them.
            if (!quizState.decompositionCache[character].error) {
                 return quizState.decompositionCache[character];
            }
        }
        try {
            const encodedChar = encodeURIComponent(character);
            const targetUrl = `https://www.kanjijump.com/api/dict/${encodedChar}`;
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

            const res = await fetchWithRetries(proxyUrl);

            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

            const parsedData = await res.json();
            
            quizState.decompositionCache[character] = parsedData;
            return parsedData;
        } catch (e) {
            console.error("Error fetching decomposition data after retries:", e);
            // Store an error state in the cache so we can show a message in the UI.
            quizState.decompositionCache[character] = { error: true };
            return { error: true };
        }
    }

    async function loadDeck(name) {
        try {
            const res = await fetch(`data/${name}.json`);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();
            let cards = data.cards || data;

            // Detect German deck format (e.g., A1_safe.json) and transform
            if (Array.isArray(cards) && cards.length > 0 && !cards[0].question && cards[0].german_term) {
                cards = cards.map(entry => ({
                    question: (entry.german_term || '').split(',')[0].trim(),
                    answer: (entry.english_term ? entry.english_term.split(/[;,\/]/).map(s => s.trim()) : []).filter(Boolean),
                    germanExample: entry.german_example || '',
                    meaning: entry.english_example || ''
                }));
            }

            return cards.filter(c => c && c.question && Array.isArray(c.answer) && c.answer.length > 0);
        } catch (e) { console.error("Error loading deck:", e); return []; }
    }
    
    async function populateDeckSelector() {
        try {
            const res = await fetch('data/decks.json');
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const decks = await res.json();
            quizState.decks = decks;
            decks.forEach(deck => {
                const option = document.createElement('option');
                option.value = deck.fileName;
                option.textContent = deck.displayName;
                deckSelectorEl.appendChild(option);
            });
        } catch (e) { console.error("Error loading deck list:", e); }
    }
    
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // --- Stats ---
    function updateStats(isCorrect) {
        const { deckName, score } = quizState;
        if (!deckName) return;
    
        const stats = getStats();
        if (!stats[deckName]) {
            stats[deckName] = { timesPlayed: 0, highScore: 0, totalCorrect: 0, totalAnswered: 0 };
        }
    
        const deckStats = stats[deckName];
    
        if (!quizState.sessionStatsRecorded) {
            deckStats.timesPlayed++;
            quizState.sessionStatsRecorded = true;
        }
    
        deckStats.totalAnswered++;
        if (isCorrect) {
            deckStats.totalCorrect++;
        }
        deckStats.highScore = Math.max(deckStats.highScore || 0, score);
    
        saveStats(stats);
        updateStatsDisplay();
    }

    function updateStatsDisplay() {
        const stats = getStats();
        const deckEntries = Object.entries(stats);
        const resetButtonHTML = '<button id="reset-stats-btn">Reset</button>';

        if (quizState.deckName) { // A quiz is active, show live stats
            const deckStats = stats[quizState.deckName] || { highScore: 0, totalCorrect: 0, totalAnswered: 0 };
            const deckInfo = quizState.decks.find(d => d.fileName === quizState.deckName);
            const displayName = deckInfo ? deckInfo.displayName : quizState.deckName;
            
            const totalCorrect = deckStats.totalCorrect;
            const totalAnswered = deckStats.totalAnswered;
            const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
    
            const statsHTML = `
                <h2>Stats ${resetButtonHTML}</h2>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Deck</span>
                        <span class="stat-value">${displayName}</span>
                    </div>
                     <div class="stat-item">
                        <span class="stat-label">Score</span>
                        <span class="stat-value">${quizState.score} / ${quizState.questionsAnswered}</span>
                    </div>
                     <div class="stat-item">
                        <span class="stat-label">Accuracy</span>
                        <span class="stat-value">${accuracy}%</span>
                    </div>
                     <div class="stat-item">
                        <span class="stat-label">High Score</span>
                        <span class="stat-value">${deckStats.highScore}</span>
                    </div>
                </div>
            `;
            statsContainer.innerHTML = statsHTML;
    
        } else { // No quiz active, show summary
            if (deckEntries.length === 0) {
                statsContainer.innerHTML = '<h2>Stats</h2><p>Play a quiz to see your stats!</p>';
                return;
            }
    
            const statsTable = `
                <h2>All-Time Stats ${resetButtonHTML}</h2>
                <table>
                    <tr><th>Deck</th><th>Hi-Score</th><th>Accuracy</th><th>Played</th></tr>
                    ${deckEntries.map(([fileName, data]) => {
                        const deckInfo = quizState.decks.find(d => d.fileName === fileName);
                        const displayName = deckInfo ? deckInfo.displayName : fileName;
                        const accuracy = data.totalAnswered > 0 ? Math.round((data.totalCorrect / data.totalAnswered) * 100) : 0;
                        return `<tr><td>${displayName}</td><td>${data.highScore}</td><td>${accuracy}%</td><td>${data.timesPlayed}</td></tr>`;
                    }).join('')}
                </table>
            `;
            statsContainer.innerHTML = statsTable;
        }
    }

    // --- Event Listeners ---
    function setupEventListeners() {
        answerInputEl.addEventListener('input', checkAnswer);
        
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (quizState.isShowingAnswer) {
                    nextQuestion();
                } else if (answerInputEl.value.trim().length > 0) {
                    // This handles submitting an answer that might be incorrect.
                    // The 'input' event listener will have already handled the correct case.
                    const userAnswer = answerInputEl.value.trim();
                    const isCorrect = quizState.currentCard.answer.some(a => a.toLowerCase() === userAnswer.toLowerCase());

                    if (!isCorrect) {
                        showAndAdvance(false);
                    }
                }
            }
        });
        
        function handleQuizStart() {
            const selectedDeck = deckSelectorEl.value;
            if (selectedDeck) {
                startQuiz(selectedDeck, 'conquest');
            }
        }
        
        deckSelectorEl.addEventListener('change', handleQuizStart);
        
        menuToggleBtn.addEventListener('click', () => sidePanel.classList.toggle('open'));
        document.addEventListener('click', (e) => {
             if (!sidePanel.contains(e.target) && e.target !== menuToggleBtn) {
                sidePanel.classList.remove('open');
            }
        });

        statsContainer.addEventListener('click', (e) => {
            if (e.target.id === 'reset-stats-btn') {
                if (confirm('Are you sure you want to reset all quiz stats and conquest progress? This will not affect your Pokédex. This action cannot be undone.')) {
                    localStorage.removeItem(STATS_KEY);
                    
                    if (quizState.deckName) {
                        quizState.score = 0;
                        quizState.questionsAnswered = 0;
                        quizState.sessionStatsRecorded = false; 
                    }
                    
                    updateStatsDisplay();
                }
            }
        });

        decompositionDisplay.addEventListener('mouseenter', () => clearTimeout(quizState.hidePopupTimeout));
        decompositionDisplay.addEventListener('mouseleave', hideDecomposition);

        // --- Pokemon Event Listeners ---
        pokemonModeToggleEl.addEventListener('change', (e) => {
            quizState.pokemonModeActive = e.target.checked;
            if (quizState.pokemonModeActive) {
                pokemonCatcherEl.style.display = 'flex';
                document.getElementById('pokedex-container').style.display = 'flex';
                if (!quizState.pokedexLoaded) {
                    fetchAllPokemon();
                }
            } else {
                pokemonCatcherEl.style.display = 'none';
                document.getElementById('pokedex-container').style.display = 'none';
            }
        });

        pokedexBtn.addEventListener('click', () => {
            updatePokedexDisplay();
            pokedexModal.style.display = 'flex';
            pokedexModalContent.style.left = '';
            pokedexModalContent.style.top = '';
            pokedexModalContent.style.width = '';
            pokedexModalContent.style.height = '';
        });

        pokedexCloseBtn.addEventListener('click', () => {
            pokedexModal.style.display = 'none';
        });

        savePokedexBtn.addEventListener('click', savePokedex);

        loadPokedexBtn.addEventListener('click', () => {
            loadPokedexInput.click();
        });

        loadPokedexInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                loadPokedex(file);
            }
        });

        pokedexSearchEl.addEventListener('input', (e) => {
            quizState.pokedexSearchTerm = e.target.value;
            updatePokedexDisplay();
        });

        pokedexFiltersEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-btn')) {
                pokedexFiltersEl.querySelector('.active').classList.remove('active');
                e.target.classList.add('active');
                quizState.pokedexFilter = e.target.dataset.filter;
                updatePokedexDisplay();
            }
        });

        window.addEventListener('click', (e) => {
            if (e.target == pokedexModal) {
                pokedexModal.style.display = "none";
            }
        });

        // --- Movable & Resizable Modal Logic ---
        let isDragging = false;
        let offsetX, offsetY;

        const dragHandle = document.getElementById('pokedex-header');
        dragHandle.addEventListener('mousedown', (e) => {
            // Prevent drag from starting on right-click or middle-click
            if (e.button !== 0) return;
            isDragging = true;

            // Switch to manual positioning
            const rect = pokedexModalContent.getBoundingClientRect();
            pokedexModalContent.style.left = `${rect.left}px`;
            pokedexModalContent.style.top = `${rect.top}px`;
            pokedexModal.style.justifyContent = 'flex-start';
            pokedexModal.style.alignItems = 'flex-start';

            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            pokedexModalContent.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                let newLeft = e.clientX - offsetX;
                let newTop = e.clientY - offsetY;
                
                // Constrain movement within the viewport
                const rect = pokedexModalContent.getBoundingClientRect();
                newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - rect.width));
                newTop = Math.max(0, Math.min(newTop, window.innerHeight - rect.height));

                pokedexModalContent.style.left = `${newLeft}px`;
                pokedexModalContent.style.top = `${newTop}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            pokedexModalContent.style.cursor = 'default';
        });
    }

    // --- Pokemon Mode Functions ---

    function typeAnimation(element, text, onComplete = () => {}) {
        if (quizState.typingAnimationInterval) {
            clearInterval(quizState.typingAnimationInterval);
        }
        element.textContent = '';
        let i = 0;
        const speed = 25; // milliseconds per character

        quizState.typingAnimationInterval = setInterval(() => {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
            } else {
                clearInterval(quizState.typingAnimationInterval);
                quizState.typingAnimationInterval = null;
                onComplete();
            }
        }, speed);
    }

    // Fetch all pokemon for Pokedex creation
    async function fetchAllPokemon() {
        if (quizState.pokedexLoaded) return;
        try {
            const res = await fetch(`${POKE_API_BASE_URL}/pokemon?limit=${TOTAL_POKEMON}`);
            const data = await res.json();
            quizState.allPokemon = data.results.map((p, i) => ({
                id: i + 1,
                name: p.name,
                sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${i + 1}.png`
            }));
            quizState.pokedexLoaded = true;
            console.log('Pokedex data loaded!');
            updatePokedexDisplay(); // Initial display
        } catch (e) {
            console.error('Failed to load Pokemon list', e);
        }
    }

    function determineRarityTier() {
        const rand = Math.random() * 100;
        if (rand < 50) return 'common'; // 50% chance
        if (rand < 85) return 'uncommon'; // 35% chance
        if (rand < 99) return 'rare'; // 14% chance
        return 'legendary'; // 1% chance
    }

    async function getPokemonByRarity() {
         const tier = determineRarityTier();
        
        // Simplified rarity logic. We can make this more complex later.
        // For now, just grab a random pokemon and we'll pretend it matches the rarity.
        // A real implementation would fetch species data to check `is_legendary` etc.
        const randomIndex = Math.floor(Math.random() * quizState.allPokemon.length);
        const pokemonInfo = quizState.allPokemon[randomIndex];

        return {
            id: pokemonInfo.id,
            name: pokemonInfo.name.charAt(0).toUpperCase() + pokemonInfo.name.slice(1),
            sprite: pokemonInfo.sprite,
        };
    }

    async function spawnPokemon() {
        if (!quizState.pokedexLoaded) await fetchAllPokemon();
        
        const pokemon = await getPokemonByRarity();
        quizState.wildPokemon = pokemon;

        pokemonImageEl.src = pokemon.sprite;
        pokemonNameEl.classList.remove('caught-text');
        pokemonImageEl.classList.add('visible');
        typeAnimation(pokemonNameEl, `A wild ${pokemon.name} appeared!`);
    }

    function catchPokemon(pokemon) {
        if (!quizState.pokedex.includes(pokemon.id)) {
            quizState.pokedex.push(pokemon.id);
            savePokedexToStorage(quizState.pokedex);
            console.log(`Caught ${pokemon.name}!`);
            updatePokedexDisplay();
        }
        
        pokemonNameEl.classList.add('caught-text');
        typeAnimation(pokemonNameEl, `Gotcha! ${pokemon.name} was caught!`, () => {
             // Hide the image and clear state after the "caught" message has finished typing
            setTimeout(() => {
                pokemonImageEl.classList.remove('visible');
                pokemonNameEl.textContent = '';
                quizState.wildPokemon = null; 
            }, 1500); // Wait 1.5 seconds after typing
        });
    }

    function updatePokedexDisplay() {
        const searchTerm = quizState.pokedexSearchTerm.toLowerCase();
        
        const filteredPokemon = quizState.allPokemon.filter(p => {
            // Filter logic
            const isCaught = quizState.pokedex.includes(p.id);
            let matchesFilter = true;
            if (quizState.pokedexFilter === 'caught') {
                matchesFilter = isCaught;
            } else if (quizState.pokedexFilter === 'missing') {
                matchesFilter = !isCaught;
            }

            // Search logic
            const matchesSearch = p.name.toLowerCase().includes(searchTerm) || String(p.id).includes(searchTerm);

            return matchesFilter && matchesSearch;
        });

        pokedexGrid.innerHTML = ''; // Clear previous results
        
        if (document.getElementById('clear-pokedex-btn') === null) {
            const clearPokedexBtn = document.createElement('button');
            clearPokedexBtn.id = 'clear-pokedex-btn';
            clearPokedexBtn.textContent = 'Clear Pokédex';
            pokedexFiltersEl.appendChild(clearPokedexBtn);

            clearPokedexBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear your entire Pokédex? This action cannot be undone.')) {
                    quizState.pokedex = [];
                    savePokedexToStorage(quizState.pokedex);
                    updatePokedexDisplay();
                }
            });
        }
        
        filteredPokemon.forEach(p => {
            const isCaught = quizState.pokedex.includes(p.id);
            const entryDiv = document.createElement('div');
            entryDiv.className = 'pokedex-entry';
            if (!isCaught) {
                entryDiv.classList.add('missing');
            }

            const idSpan = document.createElement('span');
            idSpan.className = 'pokemon-id';
            idSpan.textContent = `#${String(p.id).padStart(3, '0')}`;
            
            const img = document.createElement('img');
            img.src = p.sprite;
            img.alt = p.name;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'pokemon-name';
            nameSpan.textContent = isCaught ? (p.name.charAt(0).toUpperCase() + p.name.slice(1)) : '???';

            entryDiv.appendChild(idSpan);
            entryDiv.appendChild(img);
            entryDiv.appendChild(nameSpan);
            pokedexGrid.appendChild(entryDiv);
        });

        pokedexStatsEl.textContent = `Caught: ${quizState.pokedex.length} / ${quizState.allPokemon.length}`;
    }

    // --- Save/Load Pokedex ---
    function cipher(str, key) {
        let result = '';
        for (let i = 0; i < str.length; i++) {
            result += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return result;
    }

    function savePokedex() {
        const data = JSON.stringify(quizState.pokedex);
        const encrypted = btoa(cipher(data, SAVE_KEY));
        
        const blob = new Blob([encrypted], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'kotoba_pokedex.kotodex';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function loadPokedex(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const encrypted = e.target.result;
                const decrypted = cipher(atob(encrypted), SAVE_KEY);
                const loadedPokedex = JSON.parse(decrypted);

                if (Array.isArray(loadedPokedex) && loadedPokedex.every(id => typeof id === 'number')) {
                    quizState.pokedex = loadedPokedex;
                    updatePokedexDisplay();
                    alert('Pokedex loaded successfully!');
                } else {
                    throw new Error('Invalid save file format.');
                }
            } catch (err) {
                console.error('Failed to load or parse Pokedex file:', err);
                alert('Could not load Pokedex. The file might be corrupted or in the wrong format.');
            }
        };
        reader.readAsText(file);
    }

    function escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function highlightSentence(sentence, keywords) {
        for (const word of keywords) {
            if (!word) continue;
            const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i');
            if (regex.test(sentence)) {
                return sentence.replace(regex, '<span class="highlight-word">$&</span>');
            }
        }
        return sentence;
    }

    populateDeckSelector();
    setupEventListeners();
    updateStatsDisplay();
});

