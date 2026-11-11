let selection;
const status = (text) => { document.getElementById('status').textContent = text; };
document.getElementById('read').onclick = async () => {
  try {
    selection = await underoot.getSelection();
    document.getElementById('selection').textContent = selection.text || '当前没有源码选区，请回到编辑器选择文字。';
    document.getElementById('stats').textContent = `${selection.path} · ${selection.text.length} 字符 · ${selection.text.trim().split(/\s+/).filter(Boolean).length} 个词`;
    document.getElementById('propose').disabled = !/\bteh\b/.test(selection.text);
  } catch (error) { status(error.message); }
};
document.getElementById('propose').onclick = async () => {
  try {
    await underoot.propose({ title: '插件建议：检查拼写', detail: '将选区中的 teh 改为 the，请检查上下文后应用。', category: 'language',
      path: selection.path, from: selection.from, before: selection.text, after: selection.text.replace(/\bteh\b/g, 'the') });
    status('建议已提交，请点窗口上方“查看建议”，由作者审阅和应用。');
  } catch (error) { status(error.message); }
};
document.getElementById('save').onclick = async () => {
  try { await underoot.storage.set('note', document.getElementById('note').value); status('个人笔记已保存'); }
  catch (error) { status(error.message); }
};
underoot.ready.then(async () => { try { document.getElementById('note').value = (await underoot.storage.get('note')) || ''; } catch (error) { status(error.message); } });
