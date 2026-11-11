document.getElementById('review').onclick = async (event) => {
  const button = event.currentTarget; const result = document.getElementById('result'); button.disabled = true;
  try {
    const selection = await underoot.getSelection();
    if (!selection.text.trim()) throw new Error('请先在编辑器中选择一段源码。');
    result.textContent = '等待作者确认并调用模型…';
    const response = await underoot.complete({ instruction: 'Review only the selected academic claim. Reply ONLY JSON {"suggestions":[{"title":"...","detail":"Chinese explanation","before":"exact excerpt","after":null}]}. Identify overclaiming or missing evidence. Never invent citations or results. after may be an exact LaTeX replacement only when justified. At most 5 suggestions.', input: { excerpt: selection.text, path: selection.path } });
    const data = JSON.parse(response.text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''));
    let count = 0;
    for (const suggestion of (data.suggestions || []).slice(0, 5)) {
      await underoot.propose({ ...suggestion, path: selection.path, category: 'consistency' }); count++;
    }
    result.textContent = `已提交 ${count} 条建议。请点窗口上方“查看建议”审阅；插件不会直接修改正文。`;
  } catch (error) { result.textContent = error.message; }
  finally { button.disabled = false; }
};
