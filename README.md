# Trilium-SyntaxHighlightWidget

Syntax highlight [Trilium](https://github.com/zadam/trilium/) widget for editable note codeblocks using [highlight.js](https://github.com/highlightjs/highlight.js)

## Features
- Live syntax highlighting of any codeblock inside a text note using automatic language detection, unless plaintext is selected.
- The highlighting is not saved as formatting with the note, but just view-time markers like that highlighting that happens when you do searching.

## Installation
- Create a code note of type JS Frontend with the contents of [SyntaxHighlightWidget.js](SyntaxHighlightWidget.js) and the label #widget
- Attach the [highlight.min.js](https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.5.1/highlight.min.js) file to that note
- To enable debug output, set the code note #debugLevel attribute to one of error, warn, info, log, debug (default is info)

## Todo 
- Honor language attribute when different from plaintext instead of using automatic?
- Allow specifying the style sheet as code and/or text note attribute?
- Readonly note support?

## Discussions

https://github.com/zadam/trilium/discussions/2822

## Video

https://user-images.githubusercontent.com/6446344/165748493-ef5ad3b5-b89b-440e-b942-e105083dfada.mp4