document.getElementById('inspect').onclick = async () => {
  const output = document.getElementById('output');
  try {
    const selection = await underoot.getSelection();
    output.textContent = selection.text || 'Select manuscript text in the editor, then inspect again.';
  } catch (error) { output.textContent = error.message; }
};
