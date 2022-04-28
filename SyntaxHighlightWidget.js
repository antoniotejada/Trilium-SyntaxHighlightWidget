/*
 * Syntax Highlighter using highlight.js
 *
 * Note the highlighting is not saved with the note, but just markers like those
 * when you do searching.
 *
 * Installation
 * - Create a note
 * - Attach the file
 *   https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.5.1/highlight.min.js
 *
 * Options
 * - Set the #debug attribute to enable debug output
 * - set #highlightCodeBlock attribute to the notes you want to enable codeblock
 *   highlighting
 * 
 * Todo
 * - Don't re-highlight unmodified codeblocks
 * - honor language attribute instead of using automatic?
 * - readonly note support
 *
 * XXX The style sheet can be linked instead of embedded but embedding is faster
 * for development?
 * XXX This could be taken from the note attributes
 *
 * <link href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.5.1/styles/default.min.css" rel="stylesheet">
 */
const TPL = `
<div style="padding: 10px; border-top: 1px solid var(--main-border-color); contain: none;">
<style>
/* <link href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.5.1/styles/vs.min.css" rel="stylesheet"> */
pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{background:#fff;color:#000}.hljs-comment,.hljs-quote,.hljs-variable{color:green}.hljs-built_in,.hljs-keyword,.hljs-name,.hljs-selector-tag,.hljs-tag{color:#00f}.hljs-addition,.hljs-attribute,.hljs-literal,.hljs-section,.hljs-string,.hljs-template-tag,.hljs-template-variable,.hljs-title,.hljs-type{color:#a31515}.hljs-deletion,.hljs-meta,.hljs-selector-attr,.hljs-selector-pseudo{color:#2b91af}.hljs-doctag{color:grey}.hljs-attr{color:red}.hljs-bullet,.hljs-link,.hljs-symbol{color:#00b0e8}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}
</style>
</div`;

const showDebug = (api.startNote.getAttribute("label", "debug") != null);
function dbg(s) {
    if (showDebug) {
        console.debug("HighlightCodeBlockWidget: " + s);
    }
}

function info(s) {
    console.info("HighlightCodeBlockWidget: " + s);
}

function warn(s) {
    console.warn("HighlightCodeBlockWidget: " + s);
}

function assert(e, msg) {
    console.assert(e, "HighlightCodeBlockWidget: " + msg);
}

function debugbreak() {
    debugger;
}

function getActiveTabTextEditor(callback) {
    // Wrapper until this commit is available
    // https://github.com/zadam/trilium/commit/11578b1bc3dda7f29a91281ec28b5fe6f6c63fef
    api.getActiveTabTextEditor(function (textEditor) {
        const textEditorNtxId = textEditor.sourceElement.parentElement.component.noteContext.ntxId;
        if (glob.appContext.tabManager.activeNtxId == textEditorNtxId) {
            callback(textEditor);
        }
    });
}


class HighlightCodeBlockWidget extends api.NoteContextAwareWidget {
    constructor(...args) {
        super(...args);
        this.observer = null;
    }
    get position() { 
        // higher value means position towards the bottom/right
        return 100; 
    } 

    get parentWidget() { return 'center-pane'; }

    isEnabled() {
        return super.isEnabled()
            && this.note.type === 'text'
            && this.note.hasLabel('highlightCodeBlock');
    }

    doRender() {
        dbg("doRender");
        this.$widget = $(TPL);
        // The widget is not used other than to load the CSS
        this.$widget.hide();

        return this.$widget;
    }

    async refreshWithNote(note) {
        dbg("refreshWithNote");
        getActiveTabTextEditor(function(textEditor) {
            
            const model = textEditor.model;
            const document = textEditor.model.document;

            // Create a conversion from model to view that converts 
            // hljs:hljsClassName:uniqueId into a span with hljsClassName
            // See the list of hljs class names at
            // https://github.com/highlightjs/highlight.js/blob/6b8c831f00c4e87ecd2189ebbd0bb3bbdde66c02/docs/css-classes-reference.rst
    
            // XXX This assumes new conversions across refreshWithNote
            //     invocations don't grow infinitely, double check but this 
            //     seems to be ok when looking at 
            //     textEditor.conversion._helpers.get("editingDowncast")._dispatchers[0]._events["addMarker:hljs"].callbacks
            //     (single entry and only two callbacks)
            // XXX This could also be moved to some CKEditor initialization
            
            textEditor.conversion.for('editingDowncast').markerToHighlight( {
                model: "hljs",
                view: ( { markerName } ) => {
                    dbg("markerName " + markerName);
                    // markerName has the pattern addMarker:cssClassName:uniqueId
                    const [ , cssClassName, id ] = markerName.split( ':' );
                    
                    // The original code at 
                    // https://github.com/ckeditor/ckeditor5/blob/master/packages/ckeditor5-find-and-replace/src/findandreplaceediting.js
                    // has this comment
                    //      Marker removal from the view has a bug: 
                    //      https://github.com/ckeditor/ckeditor5/issues/7499
                    //      A minimal option is to return a new object for each converted marker...
                    return {
                        name: 'span',
                        classes: [ cssClassName ],
                        attributes: {
                            // ...however, adding a unique attribute should be future-proof..
                            'data-syntax-result': id
                        },
                    };
                }
            });

            // XXX This needs some hysteresis so it doesn't re-highlight
            //     codeblocks that didn't change, but then it also needs a
            //     per-codeblock model or marker check so markers are not
            //     removed for that codeblock 
            // XXX There's some latency because of hooking on note refresh, 
            //     maybe the code could be moved to CKEditor's onchange 
            
            model.change( writer => {
                const range = model.createRangeIn( document.getRoot() );
                // Can't invoke addMarker with an already existing marker name,
                // clear all formatting first. Marker names follow the pattern
                // hljs:cssClassName:uniqueNumber, eg hljs:hljs-comment:1
                for (const marker of model.markers.getMarkersGroup("hljs")) {
                    dbg("removing marker " + marker.name);
                    writer.removeMarker(marker.name);
                }
                
                // We use this sequence number to compose with the hljs scss
                // classname and uniquely identify each marker
                let markerCount = 0;
                // XXX There doesn't seem to be a stock way of restricting the
                //     walker to codeblocks unless using jquery and something
                //     like model.elementfromid?
                for (const value of range.getWalker()) {
                    const element = value.item;
                    // Code blocks are children of root, check only this level
                    if (!element.is("element") || (element.name != "codeBlock")) {
                        continue;
                    }
                    dbg("element " + JSON.stringify(element.toJSON()));

                    // highlight.js needs the full text without HTML tags, eg
                    // for the text
                    // #include <stdio.h>
                    // the highlighted html is
                    // <span class="hljs-meta">#<span class="hljs-keyword">include</span> <span class="hljs-string">&lt;stdio.h&gt;</span></span>
                    // But CKEditor codeblocks have <br> instead of \n
                    
                    // Do a two pass algorithm:
                    // - First pass collect the codeblock children text, change
                    //   <br> to \n
                    // - invoke highlight.js on the collected text generating
                    //   html
                    // - Second pass parse the highlighted html spans and match
                    //   each char to the CodeBlock text. Issue addMarker
                    //   CKEditor calls for each span

                    // XXX This is brittle and assumes how highlight.js
                    //     generates html (blanks, which characters escapes,
                    //     etc), a better approach would be to use highlight.js
                    //     beta api TreeTokenizer?
                    
                    // Collect all the text nodes to pass to the highlighter
                    // Text is direct children of the codeBlock
                    let text = "";
                    for (let i = 0; i < element.childCount; ++i) {
                        let child = element.getChild(i);

                        // We only expect text and br elements here
                        if (child.is("$text")) {
                            dbg("child text " + child.data);
                            text += child.data;

                        } else if (child.is("element") && 
                                  (child.name == "softBreak")) {
                            dbg("softBreak");
                            text += "\n";

                        } else {
                            warn("Unkown child " + JSON.stringify(child.toJSON()));
                        }
                    }
                    
                    // XXX This auto-detects the language, if we want to honor
                    //     the language attribute we can do
                    //     let html = hljs.highlight(text, {language: 'python'});
                    let highlightRes = hljs.highlightAuto(text);
                    dbg("text\n" + text);
                    dbg("html\n" + highlightRes.value);
                    
                    let iHtml = 0;
                    let html = highlightRes.value;
                    let spanStack = [];
                    let iChild = -1;
                    let childText = "";
                    let child = null;
                    let iChildText = 0;
                    
                    while (iHtml < html.length) {
                        // Advance the text index and fetch a new child if
                        // necessary
                        if (iChildText >= childText.length) {
                            iChild++;
                            if (iChild < element.childCount) {
                                dbg("Fetching child " + iChild);
                                child = element.getChild(iChild);
                                if (child.is("$text")) {
                                    dbg("child text " + child.data);
                                    childText = child.data;
                                    iChildText = 0;
                                } else if (child.is("element") && (child.name == "softBreak")) {
                                    dbg("softBreak");
                                    iChildText = 0;
                                    childText = "\n";
                                } else {
                                    warn("child unknown!!!");
                                }
                            } else {
                                // Don't bail if beyond the last children, since
                                // there's still html text, it must be a closing
                                // span tag that needs to be dealt with below
                                childText = "";
                            }
                        } 

                        if ((html[iHtml] == "<") && (html[iHtml+1] == "s")) {
                            // new span, note they can be nested eg C
                            // preprocessor lines are inside a hljs-meta span, 
                            // hljs-title function names inside a hljs-function
                            // span, etc
                            let iStartQuot = html.indexOf("\"", iHtml+1);
                            let iEndQuot = html.indexOf("\"", iStartQuot+1);
                            let className = html.slice(iStartQuot+1, iEndQuot);
                            // XXX highlight js uses scope for Python "title
                            //     function_", etc for now just use the first
                            //     style only
                            // See https://highlightjs.readthedocs.io/en/latest/css-classes-reference.html#a-note-on-scopes-with-sub-scopes
                            let iBlank = className.indexOf(" "); 
                            if (iBlank > 0) {
                                className = className.slice(0, iBlank);
                            }
                            dbg("Found span start " + className);
                            
                            iHtml = html.indexOf(">", iHtml) + 1;
                            
                            // push the span 
                            let posStart = writer.createPositionAt(element, child.startOffset + iChildText);
                            spanStack.push({ "className" : className, "posStart": posStart});
                         
                        } else if ((html[iHtml] == "<") && (html[iHtml+1] == "/")) {
                            // Done with this span, pop the span and mark the
                            // range
                            iHtml = html.indexOf(">", iHtml+1) + 1;
                            
                            let stackTop = spanStack.pop();
                            let posStart = stackTop.posStart;
                            let className = stackTop.className;
                            let posEnd = writer.createPositionAt(element, child.startOffset + iChildText);
                            let range = writer.createRange(posStart, posEnd);
                            let markerName = "hljs:" + className + ":" + markerCount++;
                            dbg("Found span end " + className);
                            dbg("Adding marker " + markerName + ": " + JSON.stringify(range.toJSON()));
                            writer.addMarker(markerName, {"range": range, "usingOperation": false});
                                   
                        } else {
                            // Text, we should also have text in the children
                            assert(
                                ((iChild < element.childCount) && (iChildText < childText.length)), 
                                "Found text in html with no corresponding child text!!!!"
                            );
                            if (html[iHtml] == "&") {
                                // highlight.js only encodes
                                // .replace(/&/g, '&amp;')
                                // .replace(/</g, '&lt;')
                                // .replace(/>/g, '&gt;')
                                // .replace(/"/g, '&quot;')
                                // .replace(/'/g, '&#x27;');
                                // see https://github.com/highlightjs/highlight.js/blob/7addd66c19036eccd7c602af61f1ed84d215c77d/src/lib/utils.js#L5
                               let iAmpEnd = html.indexOf(";", iHtml);
                               dbg(html.slice(iHtml, iAmpEnd));
                               iHtml = iAmpEnd + 1;
                            } else {
                                // regular text
                                dbg(html[iHtml]);
                                iHtml++;
                            }
                            iChildText++;
                        }
                    }
                }
            });
        });
    }

    async entitiesReloadedEvent({loadResults}) {
        dbg("entitiesReloaded");
        if (loadResults.isNoteContentReloaded(this.noteId)) {
            this.refresh();
        }
    }
}
info("Starting");
module.exports = new HighlightCodeBlockWidget();
let hljs = highlightminjs;

