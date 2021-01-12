import device from './modules/device.js';
import media from './modules/media.js';
import numbers from './modules/numbers.js';
import speech from './modules/speech.js';

// Register some helper aliases. NOTE - we are NOT using jQuery in this app (it's 2021...).
const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

// Feature detection to check if everything works, otherwise abandon.
if (typeof HTMLDialogElement === 'function' && speech.isBrowserSupported()) {
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
        this.op_div = false; // boolean

        this.difficulty = 'normal';  // [easy, normal, hard]
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
        media.stopAllSounds();

        document.querySelector('#game-panel').style.display = 'block';
        $('#question').textContent = 'get ready';
        await speech.speak('get ready');
        $('#question').textContent = 'set';
        await speech.speak('set');
        $('#question').textContent = 'go';
        await speech.speak('go!');
        console.info('Starting game.');
        this.startNextRound();
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
        await speech.speak(
            this.nextQuestion_raw.replace('+', ' plus ').replace('-', ' minus ').replace('*', ' times '));
    }

    async listenForAnswer() {
        if (this.paused) return;

        $('#output').textContent = '🎤';
        const answer = await speech.getSpeechResponse((err) => {
            // TODO - handle error types
        });

        console.info('listenForAnswer got: ', answer);

        if (answer && !this.censorAnswer(answer)) {
            this.processAnswer(answer);
        } else {  // null/empty/censored answer, something went wrong, try again.
            $('#output').textContent = '❓';
            setTimeout(async () => await this.listenForAnswer(), 500);  // add some delay to avoid thrashing
        }
    }

    // Process the answer that was given by the user (detected via speech recognition)
    async processAnswer(answerRaw) {
        if (this.paused) return;

        let answer = numbers.wordsToDigits(answerRaw);

        $('#output').textContent = answer;

        if (answer.toUpperCase() == "PAUSE" || answer.toUpperCase() == "STOP") {
            this.pause();
            return;
        }

        const answerNum = parseFloat(answer, 10);
        if (isNaN(answerNum)) {
            $('#output').style.color = 'red';
            await speech.speak('Sorry, could you repeat that please?');
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
        const bannedTerms = ['sex', 'suck', 'bum', 'pee', 'poo', 'poop'];
        return bannedTerms.some(v => answer.toLowerCase().includes(v));
    }

    async wrongAnswer(answer) {
        // TODO: update stats, update display
        $('#output').style.color = 'red';

        // for 'easy' mode, don't lose any marks for wrong answers, otherwise...
        if (this.options.difficulty == 'normal') {  // lose one mark
            if (this.streak > 0) this.streak--;
            $(`#marks table td:nth-of-type(${this.streak + 1})`).innerHTML = '';
        } else if (this.options.difficulty == 'hard') {  // lose all marks!
            this.streak = 0;
            $$(`#marks table td`).forEach(el => el.innerHTML = '');
        }

        // play correct answer jingle
        await media.playSound('sfx/wrong1.mp3');

        const wrongAnswers = [
            'wrong', 'nope', 'oops', 'nada', 'boom boom', 'yikes', 'not even close', 'umm... no',
        ];
        await speech.speak(
            wrongAnswers[numbers.getRandomIntInclusive(0, wrongAnswers.length - 1)] + ', ' + this.nextAnswer_expected,
            1.2, 1.2);
        return;
    }

    async rightAnswer(answer) {
        console.log('Right: ', this.streak);
        
        // TODO: update stats, update display
        $('#output').style.color = 'green';
        if (this.streak < this.options.streak) this.streak++;

        // Insert correct answer img sticker        
        const img = document.createElement('img');
        img.src = 'images/star2.gif';
        document.querySelector(`#marks table td:nth-of-type(${this.streak})`).appendChild(img);

        // play correct answer jingle
        await media.playSound('sfx/right1.mp3');

        // play correct answer robot speech
        const rightAnswers = [
            'right', 'yep', 'you got it', 'correct', 'bingo', 'perfect',
        ];
        await speech.speak(rightAnswers[numbers.getRandomIntInclusive(0, rightAnswers.length - 1)], 1.2, 1.2);
        return;
    }

    async wonGame() {
        // game over, congrats
        // show fireworks with sounds and play winning jingle
        $('#fireworks').style.display = 'block';
        media.playSound('sfx/fireworks1.mp3');
        await media.playSound('sfx/win1.mp3');

        // after winning jingle, say something 'funny'
        const congrats = [
            `well done, you got ${this.options.streak} right in a row, that's amazing, congratulations`,
            `amazing, you got ${this.options.streak} right in a row, I did not expect that, you rock`,
            `oh what cool, you got ${this.options.streak} right in a row, it's party time, let's get the music started`,
            `bingo bango, you got ${this.options.streak} right in a row, easy peasy lemon squeazy`,
            `01101001, you got ${this.options.streak} right in a row, that's 11010101, well done`,
            `yo, well done, congratulations, you deserve to party, get your groove on`,
        ];
        await speech.speak(congrats[numbers.getRandomIntInclusive(0, congrats.length - 1)], 1.2, 1.2);
        this.pause();  // will bring up options dialog
    }

    // Generates and returns a new question as a string expression.
    getNextQuestion() {
        const op = this.getRandOperator();

        let min = 0;
        if (this.options.difficulty == 'hard') {
            min = Math.ceil(this.options.max_num / 2);
        }
        if (min == 0 && op == '/') {
            min = 1;
        }

        // Avoid zeros if we're doing division.
        let term1 = numbers.getRandomIntInclusive(min, this.options.max_num);
        console.info(Number.isInteger(this.options.fix_num));
        let term2 = Number.isInteger(this.options.fix_num) && (this.options.fix_num > 0 || op != '/')
            ? this.options.fix_num
            : numbers.getRandomIntInclusive(min, this.options.max_num);
        

        // Prevent negative answers for now (speech recognition not as reliable).
        if (op == '-' && term1 < term2) {
            [term1, term2] = [term2, term1];
        } else if (op == '/') {  // ensure whole-number division answers
            const ans = term1 * term2;
            [term1, term2] = [ans, term2];
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
        if (this.options.op_div) selected++;

        if (selected < 1) throw new Error("Did not select any operators.");

        const rand = numbers.getRandomIntInclusive(1, selected);
        let op = '';
        let i = 1;
        if (!op && this.options.op_add && i++ == rand) op = '+';
        if (!op && this.options.op_sub && i++ == rand) op = '-';
        if (!op && this.options.op_mul && i++ == rand) op = '*';
        if (!op && this.options.op_div && i++ == rand) op = '/';

        console.info(`Next op: ${op} (out of ${selected} selected, rand ${rand})`);

        if (!op) throw new Error("Failed creating next random operator.");

        return op;
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
        device.initScreenWakeLock();

        const state = await speech.checkMicrophonePermissions(false, () => {
            // Callback if initial permission is 'prompt', and then changes
            // to 'granted' later. So make the app auto-continue.
            $('#mic-permissions-dialog').close();
            this.openSettingsDialog();    
        });  // state values = ['granted', 'prompt', 'denied']

        if (state != 'granted') {  // This is the initial response from permission check.
            this.openMicPermissionsDialog(state);
        } else {  // if already granted, just continue without showing perms dialog.
            this.openSettingsDialog();
        }
    }

    showError(msg) {
        $('#toast-error').MaterialSnackbar.showSnackbar({message: msg})
    }

    initEventHandlers() {
        // Bind the gear icon to open settings Dialog.
        $('#settings-btn').onclick = () => this.openSettingsDialog();

        // Bind events for settings dialog click on Play button
        $('#play-btn').onclick = () => {
            // update options
            this.options.op_add = $('#cb_add').checked;
            this.options.op_sub = $('#cb_sub').checked;
            this.options.op_mul = $('#cb_mul').checked;
            this.options.op_div = $('#cb_div').checked;

            this.options.max_num = parseInt($('#max_num').value, 10);
            this.options.fix_num = parseInt($('#fix_num').value, 10);

            this.options.difficulty = $(`#difficulty option:checked`).value;

            console.log(this.options);
            // close dialog & play/unpause game.
            $('#settings-dialog').close();
            this.game.play();
        };

        $('#settings-dialog').addEventListener('cancel', (event) => {
            event.preventDefault();
            return false;
        });

        // Wire events to show and hide the About dialog.
        $('#about-btn').onclick = () => this.openAboutDialog();
        $('#about-close-btn').onclick = () => $('#about-dialog').close();

        $('#mic-permissions-dialog').addEventListener('cancel', (event) => {
            event.preventDefault();
            return false;
        });
    }

    openAboutDialog() {
        $('#about-dialog').showModal();
    }

    openSettingsDialog() {
        this.game.pause();

        // Bind checkbox values for the 4 operands based on latest options data. 
        if (this.options.op_add) {
            $('#cb_add').checked = this.options.op_add;
            $('#cb_add').parentElement.MaterialSwitch.on();
        }
        if (this.options.op_sub) {
            $('#cb_sub').checked = this.options.op_sub;
            $('#cb_sub').parentElement.MaterialSwitch.on();
        }
        if (this.options.op_mul) {
            $('#cb_mul').checked = this.options.op_mul;
            $('#cb_mul').parentElement.MaterialSwitch.on();
        }
        if (this.options.op_mdiv) {
            $('#cb_mul').checked = this.options.op_div;
            $('#cb_div').parentElement.MaterialSwitch.on();
        }


        // Bind the max num value.
        $('#max_num').value = this.options.max_num;
        $('#max_num').parentElement.MaterialTextfield.checkDirty();

        // Bind fix_num and checkbox state for enabling/disabling it.
        $('#fix_num').value = this.options.fix_num == null || isNaN(this.options.fix_num) ? null : this.options.fix_num;
        $('#fix_num').parentElement.MaterialTextfield.checkDirty();

        // Bind difficulty setting.
        $(`#difficulty [value="${this.options.difficulty}"]`).selected = true;
        $('#difficulty').parentElement.MaterialTextfield.checkDirty();

        componentHandler.upgradeDom();

        $('#settings-dialog').showModal();
    }

    openMicPermissionsDialog(state) {
        // Show the right info block based on microphone permission state.
        if (state == 'prompt') {
            $('#mic-permissions-dialog .state-prompt').style.display = 'block';
        } else if (state == 'denied') {
            $('#mic-permissions-dialog .state-denied').style.display = 'block';
        }

        // Wire the close button event.
        $('#permissions-close-btn').onclick = () => {
            $('#mic-permissions-dialog').close();
            this.openSettingsDialog();    
        };

        // Show the dialog.
        $('#mic-permissions-dialog').showModal();
    }

}

const myApp = new App();
myApp.run();