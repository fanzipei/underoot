# Slides chat deletion — v0.10.6

The chat previously treated a command such as `删掉第3页` as a request to rewrite a single page. The model schema required a complete `page` object and had no deletion operation. A deletion-shaped model response consequently failed page validation with `模型修改方案格式不正确`.

Recognize explicit standalone deletion commands on the server before the model path (`删掉第3页`, `请删除第 3 页。`, `把第3页删掉`, `delete slide 3`). Use the visible PDF numbering: page 1 is the cover and page 2 is the first body page. Deletion creates a typed proposal, uses the existing acceptance/version/access guards, removes only the selected marked TeX block and records the deleted page's former position and exact bytes. Do not regenerate unrelated pages or call a model. The chat reports the original page number after deletion.

`撤销上次修改` restores the deleted page and its exact TeX at its original position without a model request. Subsequent manual edits block restoration rather than being overwritten; project/file history remains available. Cover removal, out-of-range pages, removing the final body page and deletion of an already manually edited block are rejected explicitly. These structural operations apply to Slides; Poster remains a single-sheet document.

Integration checks exercise proposal rejection, exact one-frame removal, no model calls, compilation after deletion, stale acceptance, exact undo with page order, selected-block manual-edit protection and manual edits after deletion. Tests use disposable projects and a disposable database, never existing user Slides.
