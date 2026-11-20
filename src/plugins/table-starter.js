import { escapeCell, replaceFormattedCell, serializeTable } from './table-model.js';

// Excel exports TSV with quotes around cells containing tabs or line breaks.
export function excelCells(text) {
  if (!text.length) throw Error('剪贴板中没有表格文本');
  if (text.length > 150000) throw Error('粘贴内容过大，请分批导入');
  const rows = [];
  const quoted = /"((?:[^"]|"")*)"(?=\t|\r|\n|$)/y;
  const plain = /[^\t\r\n]*/y;
  let row = [], at = 0;
  while (true) {
    quoted.lastIndex = plain.lastIndex = at;
    const field = (text[at] === '"' && quoted.exec(text)) || plain.exec(text);
    row.push(field.length === 2 ? field[1].replaceAll('""', '"') : field[0]);
    if (row.length > 24) throw Error('粘贴数据最多支持 24 列');
    at += field[0].length;
    if (text[at] === '\t') { at++; continue; }
    rows.push(row);
    if (rows.length > 200) throw Error('粘贴数据最多支持 200 行');
    if (at === text.length) break;
    at += text.startsWith('\r\n', at) ? 2 : 1;
    if (at === text.length) break;
    row = [];
  }
  return rows;
}

function excelTextToTex(value) {
  const lines = value.split(/\r\n?|\n/).map(escapeCell);
  return lines.length === 1 ? lines[0] :
    '\\shortstack[l]{' + lines.map(line => line || '\\strut').join(' \\\\ ') + '}';
}

export function configureEmptyGrid(model, rowCount, colCount, values = []) {
  if (model?.emptyRowAt == null) throw Error('只能初始化空表');
  if (!Number.isInteger(rowCount) || rowCount < 1 || rowCount > 200 ||
      !Number.isInteger(colCount) || colCount < 1 || colCount > 24) {
    throw Error('表格尺寸需为 1–200 行、1–24 列');
  }
  if (model.custom && colCount !== model.cols.length) throw Error('此表有自定义列定义，请在 TeX 中调整列数');
  if (model.rows.some(row => row.some(cell => cell.span > 1))) throw Error('请先拆分合并列');
  if (model.rows.some((row, r) => row.some((cell, c) => cell.tex && (r >= rowCount || c >= colCount)))) {
    throw Error('缩小表格会移除已填写的内容，请先清空这些单元格');
  }

  const cols = Array.from({ length: colCount }, (_, c) => model.cols[c] || 'c');
  const rows = Array.from({ length: rowCount }, (_, r) =>
    Array.from({ length: colCount }, (_, c) => {
      const previous = model.rows[r]?.[c];
      const value = values[r]?.[c];
      const tex = value === undefined ? previous?.tex ?? '' : excelTextToTex(value);
      if (value !== undefined && previous?.tex && previous.tex !== tex) {
        throw Error('粘贴范围内已有内容，请先清空对应单元格');
      }
      return { original: '', span: 1, rowSpan: 1, ...previous, col: c, tex };
    })
  );
  const next = { ...model, cols, rows, emptyGridEdited: true,
    structural: model.structural || colCount !== model.cols.length };
  if (new TextEncoder().encode(serializeTable(next)).length > 150000) {
    throw Error('生成的表格超过 150 KB，请减少数据量');
  }
  return next;
}

export function pasteTableCells(model, [startRow, startIndex], values) {
  const start = model.rows[startRow]?.[startIndex];
  if (!start) throw Error('请先选中要粘贴到的单元格');
  const startCol = model.rows[startRow].slice(0, startIndex).reduce((col, cell) => col + cell.span, 0);
  const columns = Math.max(...values.map(row => row.length));
  if (startRow + values.length > model.rows.length || startCol + columns > model.cols.length) {
    throw Error('粘贴区域超出表格范围，请调整起始位置或先增删行列');
  }

  const single = values.length === 1 && columns === 1;
  const upwardSpans = new Set();
  model.rows.forEach((row, r) => {
    let col = 0;
    for (const cell of row) {
      for (let above = Math.max(0, r + cell.rowSpan + 1); above < r; above++) {
        for (let c = col; c < col + cell.span; c++) upwardSpans.add(above * model.cols.length + c);
      }
      col += cell.span;
    }
  });
  const rows = model.rows.slice();
  for (const [offset, valuesRow] of values.entries()) {
    const row = rows[startRow + offset] = model.rows[startRow + offset].slice();
    const byColumn = new Map();
    let col = 0;
    for (const [index, cell] of row.entries()) {
      byColumn.set(col, index);
      col += cell.span;
    }
    for (const [columnOffset, value] of valuesRow.entries()) {
      const index = byColumn.get(startCol + columnOffset);
      const cell = row[index];
      if (!cell || cell.covered || upwardSpans.has((startRow + offset) * model.cols.length + startCol + columnOffset) ||
          (!single && (cell.span > 1 || Math.abs(cell.rowSpan) > 1))) {
        throw Error('粘贴区域碰到合并单元格，请避开该区域或单独粘贴到合并单元格');
      }
      // A one-column row may omit its final row terminator. Keep a blank entry
      // explicit so clearing its value cannot remove the row during parsing.
      const text = excelTextToTex(value) || (model.cols.length === 1 && cell.tex ? '\\relax' : '');
      row[index] = { ...cell, tex: replaceFormattedCell(cell.tex, text) };
    }
  }
  const next = { ...model, rows };
  if (new TextEncoder().encode(serializeTable(next)).length > 150000) {
    throw Error('生成的表格超过 150 KB，请减少数据量');
  }
  return next;
}
