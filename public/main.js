// Register some helper aliases. NOTE - we are NOT using jQuery in this app (it's 2021...).
$ = document.querySelector.bind(document);
$$ = document.querySelectorAll.bind(document);

// Aliases for the Speech Recognition API classes to be used in the program.
window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
window.SpeechGrammarList = window.SpeechGrammarList || window.webkitSpeechGrammarList;
window.SpeechRecognitionEvent = window.SpeechRecognitionEvent || window.webkitSpeechRecognitionEvent;

// Feature detection to check if everything works, otherwise abandon.
if (typeof HTMLDialogElement === 'function'
    && window.SpeechRecognition
    && window.SpeechGrammarList
    && window.SpeechRecognitionEvent
    && window.speechSynthesis
    && window.SpeechSynthesisUtterance) {
    console.info('All needed features supported, phew!');
} else {
    $('#game-panel').style.display = 'none';
    $('#unsupported-browser').style.display = 'block';
    throw new Error("Unsupported browser!");
}

// Set of options passed to a game that define numbers, operators and other constants.
// Defaults are used for quick-play, user can change via a settings dialog.
class Options {
    constructor() {
        this.op_add = true; // boolean
        this.op_sub = true; // boolean
        this.op_mul = true; // boolean

        this.max_num = 10;  // number
        this.fix_num = null;  // number
        this.delay_ms = 3000; // number;

        this.streak = 10;  // number of correct answers needed to win
    }
}

// A Game consists of multiple rounds, where each round is a separate question that
// the user must answer. The game ends once end-criteria is met. The Game updates
// state on the HTML UI.
class Game {

    constructor(options, app) {
        this.options = options;
        this.playingSounds = new Map();
        this.reset();
        this.app = app;
    }

    setOptions(options) {
        this.options = options;
    }

    // Reset all game state back to new game.
    reset() {
        this.paused = true;
        this.nextQuestion_raw = '';
        this.nextQuestion_formatted = '';
        this.nextAnswer_expected = null;
        this.round = 0;
        this.streak = 0;
        if (this.recognition) this.recognition.abort();

        // Clear previous table icons and other UI state.
        document.querySelectorAll(`#marks table td`).forEach((el) => el.textContent = '');
        $('#question').textContent = '';
        $('#output').textContent = '';
    }

    pause() {
        if (this.paused) return;
        this.reset();
        document.querySelector('#game-panel').style.display = 'none';
        this.app.openSettingsDialog();
    }

    async play() {
        this.reset();
        this.paused = false;

        $('#fireworks').style.display = 'none';
        // Try to stop all playing sound effects.
        for (const [key, value] of this.playingSounds.entries()) {
            if (value instanceof HTMLMediaElement) {
                value.pause();
            }
        }

        document.querySelector('#game-panel').style.display = 'block';
        $('#question').textContent = 'get ready';
        await this.speak('get ready');
        $('#question').textContent = 'set';
        await this.speak('set');
        $('#question').textContent = 'go';
        await this.speak('go!');
        console.log('Starting game.');
        setTimeout(() => this.startNextRound(), 10);
    }

    // Triggers next (or first) round of the game loop.
    async startNextRound() {
        if (this.paused) return;

        this.nextQuestion_raw = this.getNextQuestion();
        this.nextQuestion_formatted = this.nextQuestion_raw.replace('*', 'x').replace('/', '÷');
        this.nextAnswer_expected = eval(this.nextQuestion_raw);
        console.info('Expected answer: ' + this.nextAnswer_expected);
        this.round++;

        await this.showNextQuestion();  // display it to the user
        // listen for the answer, add a little delay so sounds don't overlap.
        // on some devices, activating the microphone plays a sound that can't be
        // disabled.
        setTimeout(() => this.listenForAnswer(), 100);  
    }

    // Displays the next question in the UI to the user.
    async showNextQuestion() {
        $('#question').textContent = `${this.nextQuestion_formatted}`;
        await this.speak(
            this.nextQuestion_raw.replace('+', ' plus ').replace('-', ' minus ').replace('*', ' times '),
            1.2, 1.2);
    }

    async listenForAnswer() {
        if (this.paused) return;

        $('#output').textContent = '🎤';
        const answer = await this.getSpeechResponse();
        console.log('listenForAnswer got: ', answer);

        if (answer && !this.censorAnswer(answer)) {
            this.processAnswer(answer);
        } else {  // null/empty/censored answer, something went wrong, try again.
            $('#output').textContent = '❓';
            setTimeout(async () => await this.listenForAnswer(), 500);  // add some delay to avoid thrashing
        }
    }

    // Process the answer that was given by the user (detected via speech recognition)
    async processAnswer(answer) {
        if (this.paused) return;

        $('#output').textContent = answer;

        if (answer.toUpperCase() == "PAUSE" || answer.toUpperCase() == "STOP") {
            this.pause();
            return;
        }

        const answerNum = parseFloat(answer, 10);
        if (isNaN(answerNum)) {
            $('#output').style.color = 'red';
            await this.speak('Sorry, could you repeat that please?');
            return await this.listenForAnswer();
        } else if (answerNum == this.nextAnswer_expected) {
            await this.rightAnswer(answer);
        } else {
            await this.wrongAnswer(answer);
        }

        if (this.streak >= this.options.streak) {
            this.wonGame();
        } else {
            // trigger next round
            setTimeout(() => this.startNextRound(), 10);
        }
    }

    // We display whatever the speech recognizer detected on the screen, but sometimes
    // it detects the wrong things, e.g. "6" can get detected as "sex", etc. We want to
    // avoid displaying inappropriate terms on the screen, so filter them out.
    censorAnswer(answer) {
        const bannedTerms = ['sex'];
        return bannedTerms.some(v => answer.toLowerCase().includes(v));
    }

    async wrongAnswer(answer) {
        // TODO: update stats, update display
        $('#output').style.color = 'red';
        if (this.streak > 0) this.streak--;

        document.querySelector(`#marks table td:nth-of-type(${this.streak + 1})`).innerHTML = '';

        // play correct answer jingle
        await this.playSound('sfx/wrong1.mp3');

        const wrongAnswers = [
            'wrong', 'nope', 'oops', 'nada', 'boom boom', 'yikes', 'not even close', 'umm... no',
        ];
        await this.speak(
            wrongAnswers[this.getRandomIntInclusive(0, wrongAnswers.length - 1)] + ', ' + this.nextAnswer_expected,
            1.2, 1.2);
        return;
    }

    async rightAnswer(answer) {
        // TODO: update stats, update display
        $('#output').style.color = 'green';
        if (this.streak < this.options.streak) this.streak++;

        // Insert correct answer img sticker        
        const img = document.createElement('img');
        img.src = 'images/star2.gif';
        document.querySelector(`#marks table td:nth-of-type(${this.streak})`).appendChild(img);

        // play correct answer jingle
        await this.playSound('sfx/right1.mp3');

        // play correct answer robot speech
        const rightAnswers = [
            'right', 'yep', 'you got it', 'correct', 'bingo', 'perfect',
        ];
        await this.speak(rightAnswers[this.getRandomIntInclusive(0, rightAnswers.length - 1)], 1.2, 1.2);
        return;
    }

    async wonGame() {
        // game over, congrats
        // show fireworks with sounds and play winning jingle
        $('#fireworks').style.display = 'block';
        this.playSound('sfx/fireworks1.mp3');
        await this.playSound('sfx/win1.mp3');

        // after winning jingle, say something 'funny'
        const congrats = [
            `well done, you got ${this.options.streak} right in a row, that's amazing, congratulations`,
            `amazing, you got ${this.options.streak} right in a row, I did not expect that, you rock`,
            `oh what cool, you got ${this.options.streak} right in a row, it's party time, let's get the music started`,
            `bingo bango, you got ${this.options.streak} right in a row, easy peasy lemon squeazy`,
            `01101001, you got ${this.options.streak} right in a row, that's 11010101, well done`,
            `yo, well done, congratulations, you deserve to party, get your groove on`,
        ];
        await this.speak(congrats[this.getRandomIntInclusive(0, congrats.length - 1)], 1.2, 1.2);
        this.pause();  // will bring up options dialog
    }

    async playSound(url, delay = 200) {
        const promise = new Promise(resolve => {
            const sound = new Audio(url);
            this.playingSounds.set(url, sound);  // Keep a reference to it so it can be paused if necessary.

            sound.onended = () => {
                this.playingSounds.delete(url);
                setTimeout(() => resolve(), delay);
            };
            sound.play().then(() => {
                // audio started playing, let it finish.
            }).catch((err) => {
                console.warn('Error playing audio: ', url, err);
            });
        });
        return promise;
    }

    // Generates and returns a new question as a string expression.
    getNextQuestion() {
        let term1 = this.getRandomIntInclusive(0, this.options.max_num);
        console.log(Number.isInteger(this.options.fix_num));
        let term2 = Number.isInteger(this.options.fix_num)
            ? this.options.fix_num
            : this.getRandomIntInclusive(0, this.options.max_num);
        const op = this.getRandOperator();

        // Prevent negative answers for now (speech recognition not as reliable).
        if (op == '-' && term1 < term2) {
            [term1, term2] = [term2, term1];
        } else if (this.options.fix_num && term2 < term1) {  
            // for fixed terms, have it as the first term, unless it would cause a negative
            [term1, term2] = [term2, term1];
        }

        const question = `${term1} ${op} ${term2}`;
        console.info(`Next question: ${question}`);

        return question;
    }

    // Generates and returns a random operator based on selected options (string).
    getRandOperator() {
        let selected = 0;
        if (this.options.op_add) selected++;
        if (this.options.op_sub) selected++;
        if (this.options.op_mul) selected++;

        if (selected < 1) throw new Error("Did not select any operators.");

        const rand = this.getRandomIntInclusive(1, selected);
        let op = '';
        let i = 1;
        if (!op && this.options.op_add && i++ == rand) op = '+';
        if (!op && this.options.op_sub && i++ == rand) op = '-';
        if (!op && this.options.op_mul && i++ == rand) op = '*';

        console.info(`Next op: ${op} (out of ${selected} selected, rand ${rand})`);

        if (!op) throw new Error("Failed creating next random operator.");

        return op;
    }

    // Returns a random int between min and max, inclusive of both
    getRandomIntInclusive(minInclusive, maxInclusive) {
        const min = Math.ceil(minInclusive);
        const max = Math.floor(maxInclusive);
        return Math.floor(Math.random() * (max - min + 1) + min); //The maximum is inclusive and the minimum is inclusive
    }

    // Initializes a SpeechRecognition object with a grammar to recognize numbers up to maxNumber.
    // Waits for the recognizer to detect a response, and returns it. Uses a new recognizer instance
    // on every call since the recognizer API seems to misbehave after repeated usage.
    // NOTE - can return null if there was an error/issue in detecting response. Caller can retry if needed.
    async getSpeechResponse(maxNumber = 150) {
        const promise = new Promise((resolve) => {

            // Initialize a grammar to recognize numbers from 0 to maxNumber.
            // NOTE - if maxNumber is too large (e.g. 1000), you'll get a 'network' error when starting the recognizer.
            // I think there's a limit to the grammar size.
            const grammar = '#JSGF V1.0; grammar numbers; public <number> = ' + [...Array(150).keys()].join(' | ') + ' ;'
            const recognition = new SpeechRecognition();
            this.recognition = recognition;		// save a handle to be able to abort on pause.
            const speechRecognitionList = new SpeechGrammarList();
            speechRecognitionList.addFromString(grammar, 1);
            recognition.grammars = speechRecognitionList;
            recognition.continuous = false;
            recognition.lang = 'en-US';
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            // If nothing got processed after 5 seconds, timeout and return null, so client
            // can trigger retry behavior. This prevents getting stuck from rare inconsistent
            // missing events from the speech recognizer api.
            const timeout = setTimeout(() => {
                resolve(null);
                console.warn("No events from speech recognizer after 5s, aborting.");
            }, 7000);

            // Called from speech recognizer event handlers after words were detected.
            const processResult = (event) => {
                clearTimeout(timeout);
                if (event && event.results && event.results.length && event.results[0].length) {
                    const numberOrWords = event.results[0][0].transcript;
                    console.info('Recognized phrase: ', numberOrWords);
                    // stop is not really synchronos for some reason.
                    resolve(numberOrWords);
                } else {
                    resolve(null);
                }
            };

            // This should be the main event called when results are detected.
            recognition.onresult = (event) => {
                recognition.stop();
                setTimeout(() => processResult(event), 10);
            }

            // Triggered when the speech being processed ended.
            recognition.onspeechend = (event) => {
                // Note this doesn't really trigger in regular execution, but very rarely it does.
                // The API seems a little buggy and inconsistent. The event property here does not
                // contain any results.
                console.info('speech end');
                // We don't do anything else here, wait for other events to trigger, e.g. onresult.
                // If nothing else triggers, we'll have a timeout that resolves(null).
            }

            recognition.onnomatch = (event) => {
                // NOTE - this doesn't really trigger regardless of the grammar, it matches
                // anything and always returns something, or times out and returns error = 'no-speech'
                // The docs say if this does trigger, it may still have event.results object.
                console.warn('No match.');
                setTimeout(() => processResult(event), 10); // returns no answer
            }

            // This always triggers when the engine disconnects. 
            recognition.onend = (event) => {
                console.info('Speech recognition service disconnected');
            }

            recognition.onerror = (event) => {
                // example errors: 'network', 'no-speech', 'not-allowed'
                if (event.error == 'not-allowed') {
                    this.pause();
                    this.app.checkMicrophonePermissions();
                }
                console.log('error: ', event.error);
                recognition.stop();
                setTimeout(() => processResult(event), 10); // returns no answer
            }

            recognition.start();
        });

        return promise;
    }

    // Speak something and resolve the promise after speaking completes.
    // Call with await(speak) for synchronous behavior.
    async speak(text, pitch = 1, rate = 1) {
        return new Promise((resolve) => {
            const synth = window.speechSynthesis;
            const utterThis = new SpeechSynthesisUtterance(text);
            utterThis.pitch = 1;
            utterThis.rate = 1;
            utterThis.onend = () => {
                resolve();  // resolves promise after speaking finished
            }
            synth.speak(utterThis);
        });
    }
}

// Main driver for application logic, instantiated on page load.
// @Singleton
class App {

    constructor() {
        this.options = new Options();
        this.game = new Game(this.options, this);
    }

    async run() {
        this.initEventHandlers();
        await this.checkMicrophonePermissions();
        this.openSettingsDialog();
    }

    initEventHandlers() {
        // Bind the gear icon to open settings Dialog.
        $('#settings-btn').onclick = () => this.openSettingsDialog();

        // Bind settings dialog controls.
        $('#fix_num_on').onchange = () => {
            console.info('fix_num_on changed', $('#fix_num_on').checked);
            if ($('#fix_num_on').checked) {
                $('#fix_num').disabled = false;
                $('#fix_num').value = 5;
            } else {
                $('#fix_num').disabled = true;
                $('#fix_num').value = null;
            }
        };
        $('#play-btn').onclick = () => {

            // update options
            this.options.op_add = $('#cb_add').checked;
            this.options.op_sub = $('#cb_sub').checked;
            this.options.op_mul = $('#cb_mul').checked;

            this.options.max_num = parseInt($('#max_num').value, 10);
            this.options.fix_num = $('#fix_num_on').checked ? parseInt($('#fix_num').value, 10) : null;

            // close dialog & play/unpause game.
            $('#settings-dialog').close();
            this.game.play();
        };

        // Wire events to show and hide the About dialog.
        $('#about-btn').onclick = () => this.openAboutDialog();
        $('#about-close-btn').onclick = () => $('#about-dialog').close();
    }

    openAboutDialog() {
        $('#about-dialog').showModal();
    }

    openSettingsDialog() {
        this.game.pause();

        // Bind checkbox values for the 4 operands based on latest options data. 
        $('#cb_add').checked = this.options.op_add;
        $('#cb_sub').checked = this.options.op_sub;
        $('#cb_mul').checked = this.options.op_mul;

        // Bind the max num value.
        $('#max_num').value = this.options.max_num;

        // Bind fix_num and checkbox state for enabling/disabling it.
        $('#fix_num').value = this.options.fix_num == null ? null : this.options.fix_num;
        $('#fix_num').disabled = this.options.fix_num == null;
        $('#fix_num_on').checked = this.options.fix_num != null;

        $('#settings-dialog').showModal();
    }

    async checkMicrophonePermissions() {
        const promise = new Promise((resolve) => {
            this.game.getSpeechResponse();  // this triggers the microphone permissions
            setTimeout(() => {  // give the microphone permission request prompt some time to trigger
                // Check permissions for microphone.
                navigator.permissions.query({ name: 'microphone' }).then(function (result) {
                    if (result.state == 'granted') {
                        console.info('micrphone permission is granted, phew!');
                        resolve();
                    } else if (result.state == 'prompt') {
                        console.info('prompting user for microphone permissions...');
                        // Clicking continue/close button returns from function so game can continue.
                        $('#permissions-close-btn').onclick = () => {
                            $('#permissions-dialog').close();
                            resolve();
                        }

                        // Show the correct prompt and open warning dialog.
                        $('#permissions-dialog .state-prompt').style.display = 'block';
                        $('#permissions-dialog').showModal();

                        // Add a re-check loop, so when user allows the microphone permission, we 
                        // close the dialog and continue automatically.
                        const recheck = () => {
                            console.info('...waiting for microphone permission');
                            navigator.permissions.query({ name: 'microphone' }).then(function (result) {
                                if (result.state == 'granted') {
                                    $('#permissions-dialog').close();
                                    resolve();
                                } else if (result.state == 'prompt') {
                                    setTimeout(() => recheck(), 1000);
                                }
                            });
                        };
                        recheck();

                    } else {
                        // Clicking continue/close button returns from function so game can continue.
                        $('#permissions-close-btn').onclick = () => {
                            $('#permissions-dialog').close();
                            resolve();
                        }

                        $('#permissions-dialog .state-deny').style.display = 'block';
                        $('#permissions-dialog').showModal();
                    }
                });
            }, 50);
        });
        return promise;
    }
}

const myApp = new App();
myApp.run();