const wordsMap = new Map();
        

export default {
    /** Returns a random int between min and max, inclusive of both */
    getRandomIntInclusive(minInclusive, maxInclusive) {
        const min = Math.ceil(minInclusive);
        const max = Math.floor(maxInclusive);
        return Math.floor(Math.random() * (max - min + 1) + min); //The maximum is inclusive and the minimum is inclusive
    },

    /** Convert a number like 1234 to words like 'one thousand two hundred and thirty four' */
    digitsToWords(num) {
        const a = [
            '', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ',
            'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
        const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

        if ((num = num.toString()).length > 9) throw new Error('overflow: ' + num + ' (can\'t handle >9 digits)');
        let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return; var str = '';
        str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'crore ' : '';
        str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'lakh ' : '';
        str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'thousand ' : '';
        str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'hundred ' : '';
        str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + ' ' : '';
        return str;
    },

    /** Convert words like 'one hundred and twenty nine' to a number like 129. */
    wordsToDigits(words) {
        // First time called, initialize a map dictionary with words to numbers.
        if (wordsMap.size == 0) {
            for (let i = 0; i <= 10000; i++) {
                let words = this.digitsToWords(i);
                wordsMap.set(words.replaceAll(' ', '').replaceAll('-', ''), i);
            }
        }
        let key = words.toLowerCase().replaceAll(' ', '').replaceAll('-', '');
        return wordsMap.has(key) ? wordsMap.get(key) : words;
    },
}