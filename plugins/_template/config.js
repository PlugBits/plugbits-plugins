(function () {
  kintone.plugin.app.setConfig = kintone.plugin.app.setConfig || (()=>{});
  kintone.plugin.app.getConfig = kintone.plugin.app.getConfig || (()=> ({}));

  const save = document.getElementById('save');
  const cancel = document.getElementById('cancel');
  const sample = document.getElementById('sample');

  const cfg = kintone.plugin.app.getConfig(document.currentScript?.dataset?.id || "");
  if (cfg?.sample) sample.value = cfg.sample;

  save.addEventListener('click', () => {
    kintone.plugin.app.setConfig({ sample: sample.value });
  });
  cancel.addEventListener('click', () => history.back());
})();
