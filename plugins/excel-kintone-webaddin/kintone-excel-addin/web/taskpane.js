/* global Excel */

Office.onReady(() => {
  const button = document.getElementById("fetchButton");
  if (button) {
    button.addEventListener("click", fetchKintone);
  }
});

async function fetchKintone() {
  const domain = document.getElementById("domain").value.trim();
  const appId = document.getElementById("appId").value.trim();
  const token = document.getElementById("token").value.trim();
  const condition = document.getElementById("condition").value.trim();
  const statusEl = document.getElementById("status");

  statusEl.textContent = "";

  if (!domain || !appId || !token) {
    alert("ドメイン・アプリID・APIトークンは必須です");
    return;
  }

  const limit = 500;
  let offset = 0;
  let allRecords = [];

  try {
    while (true) {
      const query =
        (condition ? condition + " " : "") +
        `order by $id asc limit ${limit} offset ${offset}`;

      const url = `https://${domain}/k/v1/records.json?app=${appId}&query=${encodeURIComponent(
        query
      )}`;

      const res = await fetch(url, {
        headers: { "X-Cybozu-API-Token": token },
      });

      if (!res.ok) {
        throw new Error(`kintone API エラー: ${res.status}`);
      }

      const json = await res.json();
      const records = json.records;

      if (!records.length) break;

      allRecords = allRecords.concat(records);
      offset += limit;
      statusEl.textContent = `${allRecords.length} 件取得済み...`;
    }

    const flat = allRecords.map((rec) => {
      const row = {};
      for (const key in rec) {
        row[key] = rec[key].value;
      }
      return row;
    });

    await writeToExcel(flat);
    statusEl.textContent = `Excel に ${flat.length} 件書き込みました`;
    alert("書き込み完了");
  } catch (err) {
    console.error(err);
    alert(err.message || "予期せぬエラーが発生しました");
  }
}

async function writeToExcel(rows) {
  await Excel.run(async (ctx) => {
    const sheet = ctx.workbook.worksheets.getActiveWorksheet();

    if (rows.length === 0) {
      sheet.getRange("A1").values = [["データなし"]];
      return;
    }

    const headers = Object.keys(rows[0]);
    const data = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))];

    const range = sheet.getRangeByIndexes(0, 0, data.length, headers.length);
    range.values = data;
    range.format.autofitColumns();
    range.format.autofitRows();

    await ctx.sync();
  });
}
