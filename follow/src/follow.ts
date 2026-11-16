import { customReaderError, customReaderUrl, iosOnly, needsSite, readerUrl, type ReaderUrlFeed } from './reader-url';
import { writeClipboard } from './clipboard';

// The follow dialog of rssdirectory.org and sodir.org. "Follow" on a feed opens it: pick a reader
// (step 1), open the feed in it (step 2), or copy the feed URL. Checking "Remember" stores the reader
// in localStorage right away (unchecking forgets it), and the next "Follow" goes straight to it. The
// last reader, "Custom", is a URL template the visitor enters (kept in localStorage too). The dialog
// markup comes from the site (followDialog in lib/follow/templates/follow-dialog.njk, with the site's
// own reader list); each Follow button carries its feed as JSON in data-follow. See ../README.md.

/** The JSON in a Follow button's data-follow. */
export interface FollowFeed extends ReaderUrlFeed {
    title: string;
    /** "host · category · frequency" */
    meta?: string;
    iconUrl?: string;
}

export const REMEMBER_KEY = 'followReader';
/** The URL template of the custom reader. */
export const CUSTOM_KEY = 'followCustomReader';
/** The custom reader's URL until the visitor enters theirs (customReaderError rejects it). */
export const CUSTOM_PRESET = 'https://reader.example.com/add?feed={URL}';

const stored = (key: string) => ({
    get: (): string | undefined => { try { return localStorage.getItem(key) || undefined; } catch { return undefined; } },
    set: (value: string | undefined) => {
        try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch { /* not remembered */ }
    },
});
const storage = stored(REMEMBER_KEY);
const customStorage = stored(CUSTOM_KEY);

/** The feed of a Follow button (or anything inside it); the #follow button for other triggers. */
export function feedOf(el: Element): FollowFeed | undefined {
    const holder = el.closest<HTMLElement>('[data-follow]') ?? document.querySelector<HTMLElement>('#follow[data-follow]');
    try {
        return holder?.dataset.follow ? JSON.parse(holder.dataset.follow) : undefined;
    } catch {
        return undefined;
    }
}

const readerButtons = (dialog: HTMLElement) => [...dialog.querySelectorAll<HTMLButtonElement>('.fd-reader')];
/** The reader buttons shown for the current feed (fillDialog hides the ones it can't use). */
const shownReaders = (dialog: HTMLElement) => readerButtons(dialog).filter(b => !b.hidden);
const selectedReader = (dialog: HTMLElement) => dialog.querySelector<HTMLButtonElement>('.fd-reader[aria-checked="true"]') ?? undefined;
const rememberBox = (dialog: HTMLElement) => dialog.querySelector<HTMLInputElement>('#fd-remember')!;
const customInput = (dialog: HTMLElement) => dialog.querySelector<HTMLInputElement>('#fd-custom-url')!;

/** iPhone, iPod or iPad; iPadOS's Safari claims to be a Mac, but has a touch screen. */
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;

/** Readers this feed or system can't use: apps that follow a site's domain, for feeds without one
 *  (rssdirectory.org's), and iOS apps elsewhere. */
const unusable = (template: string, feed: FollowFeed) => needsSite(template) && !feed.site || iosOnly(template) && !isIos();

/** The subscribe URL of a reader button, undefined for a custom reader without a usable URL. */
function subscribeUrl(button: HTMLElement, feed: FollowFeed, customTemplate = customStorage.get()): string | undefined {
    const template = button.dataset.readerUrl;
    if (template != undefined) return unusable(template, feed) ? undefined : readerUrl(template, feed);
    return customTemplate && !customReaderError(customTemplate) ? customReaderUrl(customTemplate, feed.url) : undefined;
}

/** Points "Open in …" at the selected reader; disabled (with the custom URL's error, once the visitor
 *  edited it or tried to open it) while the custom reader has no usable URL. */
function updateOpen(dialog: HTMLElement, feed: FollowFeed, showError = false): void {
    const button = selectedReader(dialog);
    if (!button) return;
    const open = dialog.querySelector<HTMLAnchorElement>('#fd-open')!;
    const input = customInput(dialog);
    const custom = button.dataset.custom != undefined;
    const url = subscribeUrl(button, feed, input.value);
    if (url) open.href = url;
    else open.removeAttribute('href');
    open.toggleAttribute('aria-disabled', !url);
    if (showError) input.dataset.touched = '';
    const error = custom && input.dataset.touched != undefined ? customReaderError(input.value) : undefined;
    const errorBox = dialog.querySelector<HTMLElement>('#fd-custom-error')!;
    errorBox.textContent = error || '';
    errorBox.hidden = !error;
    input.toggleAttribute('aria-invalid', !!error);
}

function selectReader(dialog: HTMLElement, feed: FollowFeed, name: string | undefined): void {
    const button = shownReaders(dialog).find(b => b.dataset.reader == name);
    for (const b of readerButtons(dialog))
        b.setAttribute('aria-checked', String(b == button));
    dialog.querySelector<HTMLElement>('.fd-open-box')!.hidden = !button;
    dialog.querySelector<HTMLElement>('.fd-new')!.hidden = !!button;
    dialog.querySelector<HTMLElement>('.fd-remember')!.hidden = !button;
    dialog.querySelector<HTMLElement>('.fd-custom')!.hidden = button?.dataset.custom == undefined;
    if (!button) return;
    for (const e of dialog.querySelectorAll('.fd-reader-name'))
        e.textContent = button.dataset.label || button.dataset.reader!;
    updateOpen(dialog, feed);
    if (rememberBox(dialog).checked) storage.set(name);
}

/** Puts the reader buttons in a new random order (Fisher-Yates), so no reader is favored by its
 *  place; the custom reader stays last. */
export function shuffleReaders(dialog: HTMLElement): void {
    const buttons = readerButtons(dialog).filter(b => b.dataset.custom == undefined);
    for (let i = buttons.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [buttons[i], buttons[j]] = [buttons[j], buttons[i]];
    }
    buttons[0]?.parentElement?.append(...buttons, ...readerButtons(dialog).filter(b => b.dataset.custom != undefined));
}

function fillDialog(dialog: HTMLDialogElement, feed: FollowFeed): void {
    // data-order="fixed" (webpup): the site's order, e.g. its own reader first.
    if (dialog.dataset.order != 'fixed')
        shuffleReaders(dialog);
    for (const b of readerButtons(dialog))
        b.hidden = b.dataset.readerUrl != undefined && unusable(b.dataset.readerUrl, feed);
    const icon = dialog.querySelector<HTMLImageElement>('#fd-icon')!;
    icon.hidden = !feed.iconUrl;
    if (feed.iconUrl) icon.src = feed.iconUrl;
    dialog.querySelector('#fd-title')!.textContent = feed.title;
    dialog.querySelector('#fd-meta')!.textContent = feed.meta || '';
    const feedName = dialog.querySelector('#fd-feed-name'); // not on every site
    if (feedName) feedName.textContent = feed.title;
    dialog.querySelector<HTMLInputElement>('#fd-url')!.value = feed.url;
    showCopyState(dialog);
    dialog.querySelector('#fd-back')!.textContent = dialog.dataset.back || `Back to ${feed.title}`;
    const input = customInput(dialog);
    input.value = customStorage.get() || CUSTOM_PRESET;
    delete input.dataset.touched;
    const remembered = storage.get();
    const rememberedShown = shownReaders(dialog).some(b => b.dataset.reader == remembered);
    rememberBox(dialog).checked = rememberedShown;
    // Preselected: the remembered reader, else the last pick on this page (data-pick); at first none.
    selectReader(dialog, feed, rememberedShown ? remembered : dialog.dataset.pick);
}

/** "Follow": straight to the remembered reader, else (also for a custom reader without a usable
 *  URL) the dialog. */
export function follow(feed: FollowFeed, dialog: HTMLDialogElement, forceDialog = false): void {
    const remembered = forceDialog ? undefined : readerButtons(dialog).find(b => b.dataset.reader == storage.get());
    const url = remembered && subscribeUrl(remembered, feed);
    if (url) {
        window.open(url, '_blank', 'noopener');
        return;
    }
    fillDialog(dialog, feed);
    dialog.showModal();
}

let copyTimer: ReturnType<typeof setTimeout> | undefined;

/** The Copy button's label and look (data-state: 'copied', 'failed', or none). */
function showCopyState(dialog: HTMLDialogElement, state?: 'copied' | 'failed'): void {
    clearTimeout(copyTimer);
    const button = dialog.querySelector<HTMLButtonElement>('#fd-copy')!;
    button.textContent = state == 'copied' ? 'Copied' : state == 'failed' ? 'Copy failed' : 'Copy';
    if (state) button.dataset.state = state;
    else delete button.dataset.state;
    if (state) copyTimer = setTimeout(() => showCopyState(dialog), 2500);
}

/** Copies the feed URL. When that fails, the URL is left selected for Ctrl+C or the context menu. */
async function copyUrl(dialog: HTMLDialogElement, url: string): Promise<void> {
    const field = dialog.querySelector<HTMLInputElement>('#fd-url')!;
    const copied = await writeClipboard(url, field);
    if (!copied) {
        field.focus();
        field.select();
    }
    showCopyState(dialog, copied ? 'copied' : 'failed');
}

let current: FollowFeed | undefined;
let initialized = false;

const getDialog = () => document.getElementById('follow-dialog') as HTMLDialogElement | null;

function onPageClick(e: MouseEvent): void {
    const dialog = getDialog();
    const trigger = (e.target as Element).closest('.follow-label, .follow-choose, [data-follow-open]');
    if (!dialog || !trigger) return;
    e.preventDefault();
    const feed = feedOf(trigger);
    if (!feed) return; // the feed page's feed isn't loaded yet
    trigger.closest('details')?.removeAttribute('open');
    current = feed;
    follow(feed, dialog, trigger.classList.contains('follow-choose'));
}

function onDialogClick(e: MouseEvent): void {
    const dialog = getDialog();
    const target = e.target as Element;
    if (!dialog || !current || !dialog.contains(target)) return;
    // A click on the backdrop lands on the dialog element itself.
    if (target == dialog || target.closest('[data-fd-close]'))
        return dialog.close();
    const reader = target.closest<HTMLButtonElement>('[data-reader]');
    if (reader) {
        dialog.dataset.pick = reader.dataset.reader;
        return selectReader(dialog, current, reader.dataset.reader || undefined);
    }
    const open = target.closest('#fd-open');
    if (open?.hasAttribute('aria-disabled')) {
        updateOpen(dialog, current, true);
        return customInput(dialog).focus();
    }
    if (open)
        return dialog.close(); // the link itself opens the reader in a new tab
    if (target.id == 'fd-url')
        return (target as HTMLInputElement).select();
    if (target.closest('#fd-copy'))
        copyUrl(dialog, current.url);
}

/** "Remember": stores the selected reader at once, unchecking forgets it. */
function onDialogChange(e: Event): void {
    const box = e.target as HTMLInputElement;
    if (box.id != 'fd-remember') return;
    const dialog = box.closest('dialog');
    storage.set(box.checked && dialog ? selectedReader(dialog)?.dataset.reader : undefined);
}

/** The custom reader's URL: kept as typed, checked as typed. */
function onDialogInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    const dialog = getDialog();
    if (input.id != 'fd-custom-url' || !dialog || !current) return;
    customStorage.set(input.value.trim());
    updateOpen(dialog, current, true);
}

/** The open Follow menus (<details>, the chevron's) close like a menu: on a click outside them. */
function onMenuClick(e: MouseEvent): void {
    const target = e.target as Node;
    for (const menu of document.querySelectorAll<HTMLDetailsElement>('details.follow-more[open]'))
        if (!menu.contains(target)) menu.open = false;
}

/** ...and on Escape, back to their chevron. */
function onMenuKey(e: KeyboardEvent): void {
    if (e.key != 'Escape') return;
    for (const menu of document.querySelectorAll<HTMLDetailsElement>('details.follow-more[open]')) {
        menu.open = false;
        menu.querySelector('summary')?.focus();
    }
}

/** Handles all Follow buttons of the page (also ones added later, like the feed page's). */
export function initFollow(): void {
    document.documentElement.classList.add('js');
    if (initialized) return;
    initialized = true;
    document.addEventListener('click', onMenuClick);
    document.addEventListener('keydown', onMenuKey);
    document.addEventListener('click', onPageClick);
    document.addEventListener('click', onDialogClick);
    document.addEventListener('change', onDialogChange);
    document.addEventListener('input', onDialogInput);
}

