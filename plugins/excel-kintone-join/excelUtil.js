(function (namespace) {
  'use strict';

  const ensureSheetJs = () => {
    if (typeof XLSX === 'undefined') {
      throw new Error('SheetJS (XLSX) is not loaded');
    }
  };

  const ensureFileSaver = () => {
    if (typeof saveAs !== 'function') {
      throw new Error('FileSaver is not available');
    }
  };

  const readWorkbookFromFile = async (file) => {
    ensureSheetJs();
    if (!file) {
      throw new Error('File is required');
    }
    const buffer = await file.arrayBuffer();
    return XLSX.read(buffer, { type: 'array', cellDates: true });
  };

  const sheetToRows = (workbook, sheetName) => {
    ensureSheetJs();
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return [];
    }
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  };

  const rowsToWorkbook = (rows, sheetName) => {
    ensureSheetJs();
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(book, sheet, sheetName || 'JOIN');
    return book;
  };

  const downloadRowsAsXlsx = (rows, options = {}) => {
    ensureFileSaver();
    const workbook = rowsToWorkbook(rows, options.sheetName);
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileName = options.fileName || 'kintone-join.xlsx';
    saveAs(blob, fileName);
    return workbook;
  };

  namespace.excelUtil = {
    readWorkbookFromFile,
    sheetToRows,
    rowsToWorkbook,
    downloadRowsAsXlsx
  };
})(window.PlugbitsExcelJoin = window.PlugbitsExcelJoin || {});
