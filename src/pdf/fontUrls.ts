// Browser font sources: Vite emits the TTFs as same-origin assets and hands
// us their URLs. Imported only from download.ts so the fonts travel inside
// the lazy @react-pdf chunk, never the initial page load.
import regular from './fonts/PT_Serif-Web-Regular.ttf?url'
import italic from './fonts/PT_Serif-Web-Italic.ttf?url'
import bold from './fonts/PT_Serif-Web-Bold.ttf?url'
import boldItalic from './fonts/PT_Serif-Web-BoldItalic.ttf?url'

import type { FontSources } from './registerFonts'

export const fontUrls: FontSources = { regular, italic, bold, boldItalic }
