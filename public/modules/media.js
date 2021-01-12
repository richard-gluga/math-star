const playingSoundsMap = new Map();

export default {
    playingSoundsMap: new Map(),
    
    async playSound(url, delay = 200) {
        const promise = new Promise(resolve => {
            const sound = new Audio(url);
            playingSoundsMap.set(url, sound);  // Keep a reference to it so it can be paused if necessary.

            sound.onended = () => {
                playingSoundsMap.delete(url);
                setTimeout(() => resolve(), delay);
            };
            sound.play().then(() => {
                // audio started playing, let it finish.
            }).catch((err) => {
                console.warn('Error playing audio: ', url, err);
            });
        });
        return promise;
    },

    stopAllSounds() {
        // Try to stop all playing sound effects.
        for (const [key, value] of playingSoundsMap.entries()) {
            if (value instanceof HTMLMediaElement) {
                value.pause();
                playingSoundsMap.delete(key);
            }
        }
    },
}