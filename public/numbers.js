class NumberUtils {

    constructor(maxNumber) {
        this.wordsMap = new Map();
        if (maxNumber > 10000) {
            throw new Error('Limited to numbers <= 10,000 for performance safety.');
        }
        this.buildWordsMap(maxNumber);
    }

    buildWordsMap(maxNum) {
        for (let i = 0; i <= maxNum; i++) {
            let words = this.digitsToWords(i);
            this.wordsMap.set(words.replaceAll(' ', '').replaceAll('-', ''), i);
        }
    }

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
    }

    wordsToDigits(words) {
        let key = words.toLowerCase().replaceAll(' ', '').replaceAll('-', '');
        return this.wordsMap.has(key) ? this.wordsMap.get(key) : words;
    }
}