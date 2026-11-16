import { CUSTOM_KEY, CUSTOM_PRESET, initFollow, REMEMBER_KEY } from '../src/follow';

// jsdom has no modal dialogs.
HTMLDialogElement.prototype.showModal = function () { this.open = true; };
HTMLDialogElement.prototype.close = function () { this.open = false; };

const feed = { id: 'fqo', friendlyId: 'billboard', title: 'Billboard', url: 'https://www.billboard.com/feed/', meta: 'www.billboard.com · Music', iconUrl: 'https://x/icon.webp' };

// The markup of a site's follow button and of followDialog
// (../templates/follow-dialog.njk), reduced to what follow.ts uses.
const PAGE = (back = '') => `
    <div class="follow" id="follow" data-follow='${JSON.stringify(feed)}'><button class="follow-label">Follow</button>
        <details class="follow-more" open><button class="follow-choose">Choose a reader…</button></details></div>
    <a href="#follow" data-follow-open>Follow</a>
    <dialog id="follow-dialog" ${back ? `data-back="${back}"` : ''}>
        <img id="fd-icon"><h2 id="fd-title"></h2><div id="fd-meta"></div><button data-fd-close>x</button>
        <div class="fd-readers">
            <button class="fd-reader" data-reader="Downread" data-reader-url="https://feeds.downread.com/a/feed/{id}"></button>
            <button class="fd-reader" data-reader="Feedly" data-reader-url="https://feedly.com/i/subscription/feed/{url}"></button>
            <button class="fd-reader" data-reader="Inoreader" data-reader-url="https://www.inoreader.com/?add_feed={url}"></button>
            <button class="fd-reader" data-reader="HyperTexting" data-reader-url="htxt://{site}"></button>
            <button class="fd-reader" data-reader="Custom" data-label="your reader" data-custom></button>
        </div>
        <div class="fd-custom" hidden><input id="fd-custom-url"><p id="fd-custom-error" hidden></p></div>
        <label class="fd-remember"><input type="checkbox" id="fd-remember"></label>
        <button class="fd-none" data-reader="">none</button>
        <div class="fd-open-box"><a id="fd-open" href="#"></a><span class="fd-reader-name"></span><span id="fd-feed-name"></span></div>
        <div class="fd-new" hidden></div>
        <input id="fd-url" readonly><button id="fd-copy">Copy</button>
        <button data-fd-close><span id="fd-back"></span></button>
    </dialog>`;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const dialog = () => $<HTMLDialogElement>('#follow-dialog');
const click = (sel: string) => $(sel).click();

describe('follow dialog', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = PAGE();
        initFollow();
    });

    it('opens for a Follow button with its feed, no reader preselected', () => {
        click('.follow-label');
        expect(dialog().open).toBe(true);
        expect($('#fd-title').textContent).toBe('Billboard');
        expect($('#fd-meta').textContent).toBe('www.billboard.com · Music');
        expect($<HTMLInputElement>('#fd-url').value).toBe('https://www.billboard.com/feed/');
        expect($('#fd-back').textContent).toBe('Back to Billboard');
        expect(document.querySelectorAll('.fd-reader[aria-checked="true"]').length).toBe(0);
        expect($('.fd-open-box').hidden).toBe(true);
        expect($('.fd-remember').hidden).toBe(true);
        expect($('.fd-new').hidden).toBe(false);
        click('.fd-reader[data-reader="Downread"]');
        expect($<HTMLAnchorElement>('#fd-open').href).toBe('https://feeds.downread.com/a/feed/billboard');
    });

    it('hides readers that follow a site for feeds without one', () => {
        localStorage.setItem(REMEMBER_KEY, 'HyperTexting');
        click('.follow-label');
        expect(dialog().open).toBe(true);
        expect($('[data-reader="HyperTexting"]').hidden).toBe(true);
        expect(document.querySelectorAll('.fd-reader[aria-checked="true"]').length).toBe(0);
        expect($<HTMLInputElement>('#fd-remember').checked).toBe(false);
    });

    it('opens readers that follow a site with its domain', () => {
        const ua = jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
        $('#follow').dataset.follow = JSON.stringify({...feed, site: 'billboard.com'});
        click('.follow-label');
        expect($('[data-reader="HyperTexting"]').hidden).toBe(false);
        click('[data-reader="HyperTexting"]');
        expect($<HTMLAnchorElement>('#fd-open').getAttribute('href')).toBe('htxt://billboard.com');
        ua.mockRestore();
    });

    it('hides iOS apps elsewhere, and doesn\'t go straight to them', () => {
        localStorage.setItem(REMEMBER_KEY, 'HyperTexting');
        $('#follow').dataset.follow = JSON.stringify({...feed, site: 'billboard.com'});
        click('.follow-label');
        expect(dialog().open).toBe(true);
        expect($('[data-reader="HyperTexting"]').hidden).toBe(true);
        expect(document.querySelectorAll('.fd-reader[aria-checked="true"]').length).toBe(0);
    });

    it('preselects the last pick on the page, also without Remember', () => {
        click('.follow-label');
        click('.fd-reader[data-reader="Inoreader"]');
        dialog().close();
        click('.follow-label');
        expect($('.fd-reader[aria-checked="true"]').dataset.reader).toBe('Inoreader');
        expect($<HTMLInputElement>('#fd-remember').checked).toBe(false);
        expect(localStorage.getItem(REMEMBER_KEY)).toBeNull();
        click('.fd-none');
        dialog().close();
        click('.follow-label');
        expect(document.querySelectorAll('.fd-reader[aria-checked="true"]').length).toBe(0);
    });

    it('preselects the remembered reader', () => {
        localStorage.setItem(REMEMBER_KEY, 'Feedly');
        click('.follow-choose');
        expect($('.fd-reader[aria-checked="true"]').dataset.reader).toBe('Feedly');
        expect($<HTMLInputElement>('#fd-remember').checked).toBe(true);
        expect($<HTMLAnchorElement>('#fd-open').href).toBe('https://feedly.com/i/subscription/feed/https%3A%2F%2Fwww.billboard.com%2Ffeed%2F');
    });

    it('shuffles the reader buttons every time it opens', () => {
        const order = () => [...document.querySelectorAll<HTMLElement>('.fd-readers .fd-reader')].map(b => b.dataset.reader);
        const random = jest.spyOn(Math, 'random').mockReturnValue(0);
        click('.follow-label');
        expect(order()).toEqual(['Feedly', 'Inoreader', 'HyperTexting', 'Downread', 'Custom']);
        dialog().close();
        click('.follow-label');
        expect(order()).toEqual(['Inoreader', 'HyperTexting', 'Downread', 'Feedly', 'Custom']);
        random.mockRestore();
    });

    it('keeps the order of a dialog with data-order="fixed"', () => {
        const order = () => [...document.querySelectorAll<HTMLElement>('.fd-readers .fd-reader')].map(b => b.dataset.reader);
        dialog().dataset.order = 'fixed';
        const random = jest.spyOn(Math, 'random').mockReturnValue(0);
        click('.follow-label');
        expect(order()).toEqual(['Downread', 'Feedly', 'Inoreader', 'HyperTexting', 'Custom']);
        random.mockRestore();
    });

    it('switches readers, and shows the help without one', () => {
        click('.follow-label');
        click('.fd-reader[data-reader="Feedly"]');
        expect($<HTMLAnchorElement>('#fd-open').href).toBe('https://feedly.com/i/subscription/feed/https%3A%2F%2Fwww.billboard.com%2Ffeed%2F');
        expect($('.fd-reader-name').textContent).toBe('Feedly');
        click('.fd-none');
        expect($('.fd-open-box').hidden).toBe(true);
        expect($('.fd-remember').hidden).toBe(true);
        expect($('.fd-new').hidden).toBe(false);
        expect(document.querySelectorAll('.fd-reader[aria-checked="true"]').length).toBe(0);
    });

    it('opens the reader without remembering it while Remember is unchecked', () => {
        click('.follow-label');
        expect($<HTMLInputElement>('#fd-remember').checked).toBe(false);
        click('.fd-reader[data-reader="Feedly"]');
        click('#fd-open');
        expect(dialog().open).toBe(false);
        expect(localStorage.getItem(REMEMBER_KEY)).toBeNull();
    });

    it('remembers the reader as soon as Remember is checked, and the next Follow goes straight there', () => {
        const open = jest.spyOn(window, 'open').mockImplementation(() => null);
        click('.follow-label');
        click('.fd-reader[data-reader="Feedly"]');
        click('#fd-remember');
        expect(localStorage.getItem(REMEMBER_KEY)).toBe('Feedly');
        // Another reader while checked is remembered instead.
        click('.fd-reader[data-reader="Inoreader"]');
        expect(localStorage.getItem(REMEMBER_KEY)).toBe('Inoreader');
        click('.fd-reader[data-reader="Feedly"]');
        dialog().close();
        click('.follow-label');
        expect(dialog().open).toBe(false);
        expect(open).toHaveBeenCalledWith('https://feedly.com/i/subscription/feed/https%3A%2F%2Fwww.billboard.com%2Ffeed%2F', '_blank', 'noopener');
        // "Choose a reader…" in the menu still opens the dialog, with the remembered reader selected.
        click('.follow-choose');
        expect(dialog().open).toBe(true);
        expect($('.fd-reader[aria-checked="true"]').dataset.reader).toBe('Feedly');
        expect($<HTMLInputElement>('#fd-remember').checked).toBe(true);
        expect($('.follow-more').hasAttribute('open')).toBe(false);
    });

    it('forgets the reader as soon as Remember is unchecked', () => {
        localStorage.setItem(REMEMBER_KEY, 'Feedly');
        click('.follow-choose');
        click('#fd-remember');
        expect(localStorage.getItem(REMEMBER_KEY)).toBeNull();
        expect(dialog().open).toBe(true);
    });

    describe('custom reader', () => {
        const input = () => $<HTMLInputElement>('#fd-custom-url');
        const type = (value: string) => {
            input().value = value;
            input().dispatchEvent(new Event('input', { bubbles: true }));
        };
        const error = () => $('#fd-custom-error');
        const open = () => $<HTMLAnchorElement>('#fd-open');

        it('starts with the preset URL, the Open button disabled, and no error until edited or opened', () => {
            click('.follow-label');
            expect($('.fd-custom').hidden).toBe(true);
            click('.fd-reader[data-custom]');
            expect($('.fd-custom').hidden).toBe(false);
            expect(input().value).toBe(CUSTOM_PRESET);
            expect($('.fd-reader-name').textContent).toBe('your reader');
            expect(open().hasAttribute('href')).toBe(false);
            expect(open().hasAttribute('aria-disabled')).toBe(true);
            expect(error().hidden).toBe(true);
            click('#fd-open');
            expect(dialog().open).toBe(true);
            expect(error().hidden).toBe(false);
            expect(error().textContent).toMatch(/example/);
            expect(document.activeElement).toBe(input());
        });

        it('shows errors while typing and opens a valid URL', () => {
            click('.follow-label');
            click('.fd-reader[data-custom]');
            type('reader.net/add?feed={URL}');
            expect(error().textContent).toBe('This is not a valid URL.');
            expect(input().hasAttribute('aria-invalid')).toBe(true);
            type('https://reader.net/add');
            expect(error().textContent).toBe('Put {URL} where the feed URL goes.');
            type('https://reader.net/add?feed={URL}');
            expect(error().hidden).toBe(true);
            expect(input().hasAttribute('aria-invalid')).toBe(false);
            expect(open().href).toBe('https://reader.net/add?feed=https%3A%2F%2Fwww.billboard.com%2Ffeed%2F');
            expect(localStorage.getItem(CUSTOM_KEY)).toBe('https://reader.net/add?feed={URL}');
            click('#fd-open');
            expect(dialog().open).toBe(false);
        });

        it('keeps the URL, and Follow goes straight to a remembered custom reader', () => {
            const windowOpen = jest.spyOn(window, 'open').mockImplementation(() => null);
            click('.follow-label');
            click('.fd-reader[data-custom]');
            type('myreader://subscribe/{url}');
            click('#fd-remember');
            expect(localStorage.getItem(REMEMBER_KEY)).toBe('Custom');
            dialog().close();
            click('.follow-label');
            expect(dialog().open).toBe(false);
            expect(windowOpen).toHaveBeenCalledWith('myreader://subscribe/https://www.billboard.com/feed/', '_blank', 'noopener');
            click('.follow-choose');
            expect(input().value).toBe('myreader://subscribe/{url}');
            expect($('.fd-reader[aria-checked="true"]').dataset.reader).toBe('Custom');
            windowOpen.mockRestore();
        });

        it('opens the dialog for a remembered custom reader without a usable URL', () => {
            const windowOpen = jest.spyOn(window, 'open').mockImplementation(() => null);
            localStorage.setItem(REMEMBER_KEY, 'Custom');
            localStorage.setItem(CUSTOM_KEY, 'https://example.com/?u={URL}');
            click('.follow-label');
            expect(windowOpen).not.toHaveBeenCalled();
            expect(dialog().open).toBe(true);
            windowOpen.mockRestore();
        });
    });

    it('opens from other triggers, closes, and names the page to return to', () => {
        document.body.innerHTML = PAGE('Back to Music');
        click('[data-follow-open]');
        expect(dialog().open).toBe(true);
        expect($('#fd-back').textContent).toBe('Back to Music');
        click('#fd-back');
        expect(dialog().open).toBe(false);
    });

    it('copies the feed URL', async () => {
        const writeText = jest.fn(() => Promise.resolve());
        Object.assign(navigator, { clipboard: { writeText } });
        click('.follow-label');
        click('#fd-copy');
        await Promise.resolve();
        await Promise.resolve();
        expect(writeText).toHaveBeenCalledWith('https://www.billboard.com/feed/');
        expect($('#fd-copy').textContent).toBe('Copied');
        expect($('#fd-copy').dataset.state).toBe('copied');
    });

    it('copies with the copy command where the Clipboard API is missing (plain http)', async () => {
        Object.assign(navigator, { clipboard: undefined });
        const execCommand = jest.fn(() => true);
        Object.assign(document, { execCommand });
        click('.follow-label');
        click('#fd-copy');
        await Promise.resolve();
        expect(execCommand).toHaveBeenCalledWith('copy');
        expect($('#fd-copy').textContent).toBe('Copied');
    });

    it('says so and leaves the URL selected when copying fails, then resets the button', async () => {
        jest.useFakeTimers();
        Object.assign(navigator, { clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
        Object.assign(document, { execCommand: () => false });
        click('.follow-label');
        click('#fd-copy');
        await Promise.resolve();
        await Promise.resolve();
        const field = $<HTMLInputElement>('#fd-url');
        expect($('#fd-copy').textContent).toBe('Copy failed');
        expect($('#fd-copy').dataset.state).toBe('failed');
        expect(document.activeElement).toBe(field);
        expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);
        jest.advanceTimersByTime(2500);
        expect($('#fd-copy').textContent).toBe('Copy');
        expect($('#fd-copy').dataset.state).toBeUndefined();
        jest.useRealTimers();
    });

    it('selects the whole URL on a click into it', () => {
        click('.follow-label');
        const field = $<HTMLInputElement>('#fd-url');
        field.click();
        expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);
    });

    it('does nothing while the feed is unknown', () => {
        document.body.innerHTML = PAGE().replace(/ data-follow='[^']*'/, '');
        click('.follow-label');
        expect(dialog().open).toBe(false);
    });
});

describe('follow menu', () => {
    beforeAll(() => initFollow());
    beforeEach(() => {
        document.body.innerHTML = PAGE() + '<p id="elsewhere">x</p>';
    });
    const menu = () => $<HTMLDetailsElement>('.follow-more');

    it('closes on a click outside it', () => {
        $('.follow-more').click(); // inside: stays open
        expect(menu().open).toBe(true);
        click('#elsewhere');
        expect(menu().open).toBe(false);
    });

    it('closes on Escape', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(menu().open).toBe(false);
    });
});
