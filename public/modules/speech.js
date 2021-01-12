
// Aliases for the Speech Recognition API classes to be used in the program.
window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
window.SpeechGrammarList = window.SpeechGrammarList || window.webkitSpeechGrammarList;
window.SpeechRecognitionEvent = window.SpeechRecognitionEvent || window.webkitSpeechRecognitionEvent;

export default {

    timeoutTimer: null,
    recognition: null,

    /** Abort processing any current speech requests. */
    stop() {
        this.timeoutTimer && clearTimeout(this.timeoutTimer);
        this.recognition && this.recognition.abort();
    },

    /** 
     * Initializes a SpeechRecognition object with a grammar to recognize numbers up to maxNumber.
     * Waits for the recognizer to detect a response, and returns it. Uses a new recognizer instance
     * on every call since the recognizer API seems to misbehave after repeated usage.
     * NOTE - can return null if there was an error/issue in detecting response. The errorCallback will
     * be called which may contain type of error ['network', 'no-speech', 'not-allowed']. The caller
     * is responsible for retrying as needed.
     */
    async getSpeechResponse(errorCallback = null, maxNumber = 150) {
        const promise = new Promise((resolve, reject) => {

            // Initialize a grammar to recognize numbers from 0 to maxNumber.
            // NOTE - if maxNumber is too large (e.g. 1000), you'll get a 'network' error when starting the recognizer.
            // I think there's a limit to the grammar size.
            const grammar = '#JSGF V1.0; grammar numbers; public <number> = ' + [...Array(150).keys()].join(' | ') + ' ;'
            const recognition = new SpeechRecognition();
            const speechRecognitionList = new SpeechGrammarList();
            speechRecognitionList.addFromString(grammar, 1);
            recognition.grammars = speechRecognitionList;
            recognition.continuous = false;
            recognition.lang = 'en-US';
            recognition.interimResults = false; // too aggressive, e.g. "fourteen" returns at "for", "teen", "forteen"
            recognition.maxAlternatives = 1;
            this.recognition = recognition;

            // If nothing got processed after 5 seconds, timeout and return null, so client
            // can trigger retry behavior. This prevents getting stuck from rare inconsistent
            // missing events from the speech recognizer api.
            this.timeoutTimer = setTimeout(() => {
                recognition.abort();
                resolve(null);
                console.warn("No events from speech recognizer after 10s, aborting.");
                errorCallback && errorCallback('no-speech');
            }, 10000);

            // Called from speech recognizer event handlers after words were detected.
            const processResult = (event) => {
                clearTimeout(this.timeoutTimer);
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
                    errorCallback && errorCallback('not-allowed');
                } else if (event.error == 'network') {
                    errorCallback && errorCallback('network');
                } else if (event.error == 'no-speech') {
                    errorCallback && errorCallback('no-speech');
                }
                console.log('error: ', event.error);
                recognition.stop();
                setTimeout(() => processResult(event), 10); // returns no answer
            }

            recognition.start();
        });

        return promise;
    },

    /**
     * Speak something and resolve the promise after speaking completes.
     * Call with await(speak) for synchronous behavior.
     */
    async speak(text, pitch = 1, rate = 1) {
        text = text.replace('÷', ' divided by ').replace('/', ' divided by ');
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
    },

    /** Returns true if browser supports all speech recognition / synth features. */
    isBrowserSupported() {
        return window.SpeechRecognition
            && window.SpeechGrammarList
            && window.SpeechRecognitionEvent
            && window.speechSynthesis
            && window.SpeechSynthesisUtterance;
    },

    /**
     * Triggers a speech request which forces user's browser to prompt for permissions if required, and
     * checks the permission, which can be in 3 states, ['granted', 'prompt', 'denied']. These are
     * the values returned by the function.
     * 
     * If the waitPromptCallback function is given, and the response is 'prompt', then after returning
     * the promise, the function will continue checking the permission in the background, and call the
     * given callback when permission is granted.
     * 
     * @param {bool} skipTriggerSpeechResponse - do not trigger a speech request before checking permissions.
     * @param {Function} waitPromptCallback - called after user grants permission, if the state was prompt.
     */
    async checkMicrophonePermissions(skipTriggerSpeechResponse = false, waitPromptCallback = null) {
        const promise = new Promise((resolve) => {
            if (!skipTriggerSpeechResponse) this.getSpeechResponse();  // this triggers the microphone permissions
            // Check permissions for microphone.
            navigator.permissions.query({ name: 'microphone' }).then(function (result) {
                if (result.state == 'granted') {
                    console.info('micrphone permission is granted');
                    resolve('granted');
                } else if (result.state == 'prompt') {
                    console.info('prompting user for microphone permissions...');
                    resolve('prompt');

                    if (waitPromptCallback) {
                        // Add a re-check loop, so when user allows the microphone permission, we 
                        // close the dialog and continue automatically.
                        const recheck = () => {
                            console.info('...waiting for microphone permission');
                            navigator.permissions.query({ name: 'microphone' }).then(function (result) {
                                if (result.state == 'granted') {
                                    console.info('microphone permission granted');
                                    waitPromptCallback();
                                } else if (result.state == 'prompt') {
                                    setTimeout(() => recheck(), 1000);
                                }
                            });
                        };
                        recheck();
                    }
                } else {
                    resolve('denied');
                }
            });

        });
        return promise;
    }
};