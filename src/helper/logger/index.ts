export function log(message: string[], out = console.log) {
    out(['\n----------------------------------', ...message, '----------------------------------\n'].join('\n'));
}

