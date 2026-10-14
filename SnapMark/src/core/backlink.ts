// Layout of the "↩ <DocTitle>, p. N" link written at the bottom of every snap.
// Pure, so it can be unit-tested; coordinates are Android pixels of the note page (sn-plugin-lib > 0.1.65).

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Shape expected by PluginNoteAPI.insertTextLink and by a Link element. */
export interface TextLinkSpec {
  destPath: string;
  destPage: number;
  style: number;
  linkType: number;
  rect: Rect;
  fontSize: number;
  fullText: string;
  showText: string;
  isItalic: number;
}

export const LINK_TYPE_DOCUMENT = 2;
export const LINK_STYLE_UNDERLINE = 0;
const MAX_TITLE_IN_LINK = 40;
const MIN_SIDE_CLEARANCE = 120;
const MIN_BOTTOM_CLEARANCE = 110;

/** page is 0-based (SDK); the label shows the 1-based number. */
export function backlinkSpec(docPath: string, title: string, page: number, pageSize: Size): TextLinkSpec {
  const chars = Array.from(title);
  const shortTitle = chars.length > MAX_TITLE_IN_LINK ? `${chars.slice(0, MAX_TITLE_IN_LINK - 1).join('')}…` : title;
  const showText = `↩ ${shortTitle}, p. ${page + 1}`;
  // Scaled from the Manta page (1920 px wide -> 32 px text). NOTE floats its toolbar over the left
  // ~115 px and its page bar over the bottom ~90 px of the page, so keep clear of both (seen on device).
  const fontSize = Math.max(16, Math.round(pageSize.width / 60));
  const left = Math.max(MIN_SIDE_CLEARANCE, Math.round(pageSize.width * 0.08));
  const bottom = pageSize.height - Math.max(MIN_BOTTOM_CLEARANCE, Math.round(pageSize.height * 0.05));
  const height = Math.round(fontSize * 1.6);
  const width = Math.min(pageSize.width - 2 * left, Math.round(Array.from(showText).length * fontSize * 0.62) + 16);
  return {
    destPath: docPath,
    destPage: page,
    style: LINK_STYLE_UNDERLINE,
    linkType: LINK_TYPE_DOCUMENT,
    rect: { left, top: bottom - height, right: left + width, bottom },
    fontSize,
    fullText: showText,
    showText,
    isItalic: 0,
  };
}
