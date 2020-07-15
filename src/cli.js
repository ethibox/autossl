import autoSsl from './autossl';

const args = process.argv.slice(2);

(async () => {
    const rootDomain = args[0];
    const domain = args[1];

    console.log({ rootDomain, domain });

    if (rootDomain && domain) {
        await autoSsl(rootDomain, domain).catch(({ message }) => {
            console.error(`Error: ${message}`);
        });
    }
})();
