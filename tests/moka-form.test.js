const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

// Structural fixture based on supplied Moka DOM and public Sugar Design rendering code.
// Synthetic candidate data only. It records component commits independently of input.value.
async function fixture(browser, config = {}) {
  const page = await browser.newPage();
  await page.setContent(`<style>
    [class*="apply-field-"] {margin:10px; width:300px}
    [class*="sd-Dropdown-container-"] {position:relative; width:280px}
    [class*="sd-Select-container"] {display:block; padding:3px}
    [class*="sd-Dropdown-dropdown-"] {background:#eee; padding:8px; width:270px}
    [class*="sd-basic-year-item-"], [class*="sd-basic-date-item-"], [class*="sd-Select-menu-item-"] {display:inline-block;padding:5px}
    [class*="sd-Icon-"] {display:inline-block;width:20px;height:20px}
    #unrelated {position:fixed;right:0;top:0}
    </style><input type="hidden" id="moka-version"><main></main>
    <div id="unrelated" class="sd-Dropdown-dropdown-other"><div class="sd-Select-menu-item-other">男</div></div>`);
  await page.evaluate((config) => {
    window.chrome = { runtime: { onMessage: { addListener(listener) { window.listener = listener; } }, sendMessage: async () => {} } };
    window.JobAutofillStorage = { addApplicationRecord: async () => {} };
    window.commits = {};
    window.actions = [];
    const values = { birth: config.initial || '', gender: '', degree: '', range0:'', range1:'', range2:'', range3:'', ...(config.values || {}) };
    let active = null;
    let year = config.year || 1990, month = 1;
    let view = config.dateView ? 'date' : 'month';
    if (config.reuse) document.body.insertAdjacentHTML('beforeend','<div id="moka-owned" data-owned="true" class="sd-Dropdown-dropdown-reused" style="display:none"></div>');
    const delay = config.delay ?? 20;
    const title = (text) => `<div class="title-random"><span><span>${text}</span></span><span class="required-asterisk-random"></span></div>`;
    const select = (id) => `<div class="sd-Dropdown-container-random"><label class="sd-Select-container-random ${config.dependent && id === 'degree' && !values.gender ? 'sd-Select-containerDisabled-random' : ''}"><span class="sd-Input-display-value-random">${values[id]}</span><input id="${id}" type="text" placeholder=""><span class="sd-Select-addon-random"></span></label><span class="portal-slot"></span></div>`;
    function render() {
      document.querySelector('main').innerHTML = config.range ? `<section class="apply-block-random" data-nav-id="block-educationInfo"><div class="blockTitle-random"><span class="text-random">教育背景</span></div><div class="apply-fields-random multi-random"><div class="apply-field-random">${title('就读时间')}<div class="month-range-select">${[0,1,2,3].map(i=>select('range'+i)).join('')}</div></div></div></section>` :
      `<section class="apply-block-random" data-nav-id="block-basicInfo"><div class="blockTitle-random"><span class="text-random">个人信息</span></div>
      <div class="apply-field-random day_info-random">${title('出生日期 (年龄)')}<div class="ctrl-random"><div class="sd-Dropdown-container-random"><label class="sd-Input-container-random day_info"><input id="birth" type="text" readonly placeholder="出生日期 (年龄)" value="${values.birth}" ${config.disabled ? 'disabled' : ''}><span class="sd-Input-addon-random sd-picker-addon-random"><div></div></span></label><span class="portal-slot"></span></div></div></div>
      ${config.selects ? `<div class="apply-field-random">${title('性别')}${select('gender')}</div><div class="apply-field-random">${title('最高学历')}${select('degree')}</div>` : ''}</section>`;
      document.querySelectorAll('main input').forEach((input) => {
        if (config.portal) input.setAttribute('aria-controls','moka-owned');
        input.onclick = () => {
          if (active === input.id && panel()) return;
          active = input.id;
          window.actions.push('open:'+active);
          setTimeout(renderPanel, config.openDelay ?? delay);
        };
        input.oninput = () => {
          window.actions.push('search:'+input.id);
          if (config.searchOnly) return;
          setTimeout(() => { render(); renderPanel(true); }, config.searchDelay ?? delay);
        };
        input.onkeydown = (event) => { if (event.key === 'Escape') close(); };
      });
    }
    function panel() { return document.querySelector('[data-owned]'); }
    function close() { if (config.reuse && panel()) panel().style.display='none'; else panel()?.remove(); active = null; }
    function commit(value) {
      const id = active;
      window.actions.push('choose:'+id+':'+value);
      setTimeout(() => {
        if (!config.rejectCommit) { values[id] = value; window.commits[id] = value; }
        close(); render();
      }, config.commitDelay ?? delay);
    }
    function renderPanel(searched = false) {
      if (!active) return;
      const existing = panel();
      if (!config.reuse) existing?.remove();
      const root = config.reuse && existing || document.createElement('div');
      root.id = 'moka-owned';
      root.style.display = 'block';
      root.className = 'sd-Dropdown-dropdown-changing-hash';
      root.dataset.owned = 'true';
      if (active !== 'birth') {
        let options = active === 'gender' ? ['男', '女'] : active === 'degree' ? ['本科', '硕士'] :
          ['range0','range2'].includes(active) ? ['2018','2022','2024','2026'] : Array.from({length:12},(_,i)=>String(i+1));
        if (config.searchOnly || (config.search && !searched)) options = [];
        root.innerHTML = '<div class="sd-Select-menu-random">' + options.map(text=>`<div class="sd-Select-menu-item-random">${text}</div>`).join('') + '</div>';
        root.querySelectorAll('[class*="sd-Select-menu-item-"]').forEach((el) => el.onclick = () => commit(el.textContent));
      } else {
        root.innerHTML = `<div class="sd-panal-menu-wrapper-random"><div class="sd-basic-selector-random"><span class="sd-Icon-icondoubleLeft-random ${config.blockYear ? 'sd-basic-disabled-random' : ''}"></span><span class="sd-basic-selector-year-random">${year}年</span>${view === 'date' ? `<span class="sd-basic-selector-month-random">${month}月</span>` : ''}<span class="sd-Icon-icondoubleRight-random ${config.blockYear ? 'sd-basic-disabled-random' : ''}"></span></div><div class="sd-panal-table-container-random"></div></div>`;
        ['Left','Right'].forEach((direction) => root.querySelector(`[class*="icondouble${direction}"]`).onclick = () => {
          window.actions.push(direction);
          if (config.blockYear || config.stuckYear) return;
          setTimeout(() => { year += direction === 'Right' ? 1 : -1; render(); renderPanel(); }, delay);
        });
        const body = root.querySelector('[class*="sd-panal-table-"]');
        if (view === 'month') {
          const months = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
          body.innerHTML = months.map((text,i)=>`<div class="sd-basic-year-wrapper-random ${config.disabledMonth === i+1 ? 'sd-basic-disabled-random' : ''}"><div class="sd-basic-year-item-random">${text}</div></div>`).join('');
          body.querySelectorAll('[class*="sd-basic-year-wrapper-"]').forEach((el, i) => el.onclick = () => {
            if (config.disabledMonth === i+1) throw Error('clicked disabled month');
            window.actions.push('month:'+(i+1));
            month = i+1;
            if (config.monthOnly) return commit(`${year}-${String(month).padStart(2,'0')}`);
            setTimeout(() => { view = 'date'; render(); renderPanel(); }, delay);
          });
        } else {
          root.querySelector('[class*="sd-basic-selector-month-"]').onclick = () => { view='month'; renderPanel(); };
          body.innerHTML = '<table><tbody><tr><td class="sd-basic-fade-random"><div class="sd-basic-date-item-random">29</div></td>' + Array.from({length:new Date(year,month,0).getDate()},(_,i)=>`<td class="${config.disabledDay === i+1 ? 'sd-basic-disabled-random' : ''}"><div class="sd-basic-date-item-random">${i+1}</div></td>`).join('') + '</tr></tbody></table>';
          body.querySelectorAll('td').forEach((el) => el.onclick = () => {
            if (/fade|disabled/.test(el.className)) throw Error('clicked unavailable day');
            commit(`${year}-${String(month).padStart(2,'0')}-${el.textContent.padStart(2,'0')}`);
          });
        }
      }
      const input = document.getElementById(active);
      if (config.portal) document.body.append(root);
      else input.closest('[class*="sd-Dropdown-container-"]').querySelector('.portal-slot').append(root);
    }
    document.querySelector('#unrelated').onclick = () => window.actions.push('WRONG-POPUP');
    document.body.addEventListener('click', (event) => { if (!event.composedPath().some(el => el.matches?.('[class*="sd-Dropdown-container-"],[data-owned],#unrelated'))) close(); });
    render();
    if (config.preopen) { active = 'birth'; renderPanel(); }
  }, config);
  for (const file of ['shared/profile.js','shared/matcher.js','content.js']) await page.addScriptTag({path:path.join(__dirname,'..',file)});
  return page;
}

const send = (page, type, profile, overwrite = false) => page.evaluate(({type, profile, overwrite}) => new Promise(resolve => {
  window.listener({type, profile, overwrite}, null, resolve);
}), {type, profile, overwrite});

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  try {
    const cases = [
      {name:'forward years, leap day, replaced nodes and delayed commit', date:'1992-02-29', config:{openDelay:750,commitDelay:350,selects:true,search:true}},
      {name:'backward year and existing day panel', date:'1988-12-29', config:{dateView:true}},
      {name:'thirteen forward steps from 1990', date:'2003-10-06', config:{}},
      {name:'preopened popup excluded from scan', date:'1990-01-29', config:{preopen:true}},
      {name:'invalid date is rejected before interaction', date:'2001-02-29', config:{}, status:'invalid-date'},
      {name:'year button disabled', date:'1992-02-29', config:{blockYear:true}, status:'date-navigation-failed'},
      {name:'year never changes', date:'1992-02-29', config:{stuckYear:true}, status:'date-navigation-failed'},
      {name:'disabled month', date:'1990-02-28', config:{disabledMonth:2}, status:'option-not-found'},
      {name:'disabled day', date:'1990-02-28', config:{disabledDay:28}, status:'option-not-found'},
      {name:'uncommitted date is not success', date:'1990-02-28', config:{rejectCommit:true}, status:'verification-failed'},
      {name:'preserve existing date', date:'1992-02-29', config:{initial:'1990-03-02'}, status:'existing-value'},
      {name:'overwrite existing date', date:'1992-02-29', config:{initial:'1990-03-02'}, overwrite:true},
      {name:'disabled input', date:'1992-02-29', config:{disabled:true}, status:'disabled'},
      {name:'month-only panel cannot verify a requested day', date:'1990-02-28', config:{monthOnly:true}, status:'option-not-found'},
      {name:'supported month precision', date:'1990-02', config:{monthOnly:true}},
      {name:'ARIA associated body portal with reused hidden node', date:'1992-02-29', config:{portal:true,reuse:true,selects:true}},
      {name:'search query without selected option is not success', date:'1990-01-29', config:{selects:true,searchOnly:true}, selectStatus:'option-not-found'},
      {name:'dependent field becomes enabled after previous commit', date:'1990-01-29', config:{selects:true,dependent:true}},
    ];
    for (const item of cases) {
      const page = await fixture(browser,item.config);
      try {
        const profile = {personal:{birth_date:item.date,gender:'男',highest_degree:'硕士'}};
        const scan = await send(page,'JOB_AUTOFILL_SCAN',profile);
        assert.equal(scan.fields.length,item.config.selects ? 3 : 1, item.name+' canonical fields');
        assert.equal(scan.fields[0].match.path,'personal.birth_date');
        const result = await send(page,'JOB_AUTOFILL_FILL',profile,item.overwrite);
        assert.equal(result.results[0].status,item.status || 'verified-filled',JSON.stringify(result.results));
        const {commits,actions} = await page.evaluate(()=>({commits:window.commits,actions:window.actions}));
        if (!item.status) assert.equal(commits.birth,item.date,item.name);
        if (item.config.selects) {
          assert.deepEqual(result.results.map(r=>r.status),['verified-filled',item.selectStatus || 'verified-filled',item.selectStatus || 'verified-filled']);
          if (!item.selectStatus) { assert.equal(commits.gender,'男'); assert.equal(commits.degree,'硕士'); }
          else { assert.equal(commits.gender,undefined); assert.equal(commits.degree,undefined); }
        }
        assert(!actions.includes('WRONG-POPUP'));
        if (['disabled','existing-value','invalid-date'].includes(item.status)) assert.equal(actions.length,0);
        assert.equal(await page.locator('[data-owned]:visible').count(),0);
        console.log('PASS',item.name);
      } finally { await page.close(); }
    }
    const range = await fixture(browser,{range:true});
    const profile = {education:[{start_date:'2018-09',end_date:'2022-06'}],autofill:{repeat_sections:{education:1}}};
    const scanned = await send(range,'JOB_AUTOFILL_SCAN',profile);
    assert.equal(scanned.fields.length,4);
    assert.deepEqual(scanned.fields.map(r=>r.arrayIndex),[0,0,0,0]);
    assert.deepEqual(scanned.fields.map(r=>r.match.path),['education[].start_date','education[].start_date','education[].end_date','education[].end_date']);
    const filled = await send(range,'JOB_AUTOFILL_FILL',profile);
    assert.deepEqual(filled.results.map(r=>r.status),Array(4).fill('verified-filled'));
    assert.deepEqual(await range.evaluate(()=>window.commits),{range0:'2018',range1:'9',range2:'2022',range3:'6'});
    console.log('PASS four year/month controls keep JSON record and subcontrol identity');
    await range.close();
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
