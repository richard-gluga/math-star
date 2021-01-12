export default {
    /** Prevents screen from sleeping while tab is visible. */
    initScreenWakeLock() {
        if (!('wakeLock' in navigator)) {
            console.info('WakeLock API not supported in browser. Screen may sleep from inactivity.');
            return;
        }

        let wakeLock = null;

        const requestWakeLock = async () => {
            try {
              console.log('Requesting Screen Wake lock...');
              wakeLock = await navigator.wakeLock.request('screen');
              console.log('...lock received.');
              wakeLock.addEventListener('release', () => {
                console.log('Screen Wake Lock released:', wakeLock.released);
              });
            } catch (err) {
              console.error(`WakeLock error: ${err.name}, ${err.message}`);
            }
        };

        const handleVisibilityChange = async () => {
            if (wakeLock !== null && document.visibilityState === 'visible') {
              await requestWakeLock();
            }
        };
  
        document.addEventListener('visibilitychange', handleVisibilityChange);
        requestWakeLock();
    },
}