/**
 * The Map Editor page. It fetches `provinces.bmp` itself (the extension allows
 * the map folder as a local resource), decodes it, and draws it on a canvas
 * with pan and zoom. A click maps the pixel color to a province through
 * definition.csv and asks the extension for that province's details; the side
 * panel edits them and posts one save per section.
 *
 * Bundled on its own (`dist/mapEditorPage.js`) against the DOM lib, so this is
 * the one part of the page the type checker and the linter can see. This file
 * only wires the modules up, in the order their listeners have to exist.
 */

import { showLoading } from './dom.js';
import { messageOf, post } from './host.js';
import { initInput } from './input.js';
import { initLayers } from './layers.js';
import { initMessages } from './messages.js';
import { initPaint } from './paint.js';
import { initPaintColor } from './paintColor.js';
import { initReferences } from './references.js';

window.addEventListener('error', function (event) { showLoading('Page error: ' + event.message); });
window.addEventListener('unhandledrejection', function (event) { showLoading('Page error: ' + messageOf(event.reason)); });

initLayers();
initReferences();
initPaintColor();
initPaint();
initInput();
initMessages();
post({ type: 'ready' });
