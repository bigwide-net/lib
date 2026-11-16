// SocialSpec profiles (https://socialspec.org/): loading a domain's /.well-known/ files and feed in
// the browser, and rendering them as a profile card with tabs. Shared by sodir.org's Social
// Browser and Downread's profile page; see README.md.
export { parseDomain, bareHost, handleOf, hostOf, httpUrl } from './domain';
export { parseAbout, splitAbout, joinAbout } from './about';
export type { About } from './about';
export { createDeps, loadProfile, hasContent, SPEC_FILES, WELL_KNOWN } from './profile';
export type { Profile, FileKey, FileState, FileCheck, Deps } from './profile';
export { SODIR_PROXY, DOWNREAD_PROXY } from './fetch';
export { profileCard, errorPage, errorKind, renderPage, displayName, tabOfHash, hashOfTab, fileList, corsHelp, external, TABS } from './view';
export type { ViewOptions, ErrorKind } from './view';
export { icon } from './icons';
export type { IconName } from './icons';
export type { Feed, FeedItem } from './feed';
