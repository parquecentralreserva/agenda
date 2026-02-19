/* ============================================================
   CACHE EM MEMÓRIA — reduz leituras no D1
============================================================ */
const CACHE = { users: null, bookings: null, ts: {} };
const CACHE_TTL = 30000; // 30 segundos

/* ============================================================
   CONEXÃO COM O BANCO D1 (API)
============================================================ */
const API = {
    u: {
        get: async (force = false) => {
            const now = Date.now();
            if (!force && CACHE.users && (now - CACHE.ts.users) < CACHE_TTL)
                return CACHE.users;
            try {
                const r = await fetch('/api/users');
                CACHE.users = await r.json();
                CACHE.ts.users = now;
                return CACHE.users;
            } catch(e) { return []; }
        },
        save: async (d) => {
            CACHE.users = null;
            await fetch('/api/users', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(d) });
        },
        del: async (id) => {
            CACHE.users = null;
            await fetch(`/api/users?id=${id}`, { method: 'DELETE' });
        }
    },
    b: {
        get: async (force = false) => {
            const now = Date.now();
            if (!force && CACHE.bookings && (now - CACHE.ts.bookings) < CACHE_TTL)
                return CACHE.bookings;
            try {
                const r = await fetch('/api/bookings');
                CACHE.bookings = await r.json();
                CACHE.ts.bookings = now;
                return CACHE.bookings;
            } catch(e) { return []; }
        },
        save: async (d) => {
            CACHE.bookings = null;
            await fetch('/api/bookings', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(d) });
        },
        del: async (id) => {
            CACHE.bookings = null;
            await fetch(`/api/bookings?id=${id}`, { method: 'DELETE' });
        }
    }
};

/* Mensagens no LocalStorage */
const DB_MSG = {
    add: (u, t) => { let m = JSON.parse(localStorage.getItem('db_v27_m')) || []; m.push({to:u, txt:t, read:false}); localStorage.setItem('db_v27_m', JSON.stringify(m)); },
    get: (u)    => { let m = JSON.parse(localStorage.getItem('db_v27_m')) || []; const f = m.filter(x => x.to === u && !x.read); if(f.length){ f.forEach(x => x.read = true); localStorage.setItem('db_v27_m', JSON.stringify(m)); return f[0].txt; } return null; }
};

/* ============================================================
   ESTADO E SESSÃO
============================================================ */
let currentUser    = JSON.parse(sessionStorage.getItem('pcr_user')) || null;
let tempBk         = {};
let pendingCancelId= null;
let searchTimer    = null;

// Horários das 08:00 às 21:00
const TIMES = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];
const MANICURE_LABELS = { mao: 'Mão', pe: 'Pé', ambos: 'Mão + Pé (2 horários)' };

const getToday    = ()  => new Date().toISOString().split('T')[0];
const isPast      = (d) => d < getToday();
const fmtDate     = (s) => {
    if (!s) return '—';
    const [y,m,d] = s.split('-');
    const months  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${d} ${months[parseInt(m)-1]} ${y}`;
};
const getInitials = (n) => n ? n.trim().substring(0,2).toUpperCase() : '??';
const dayName     = (s) => { const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']; return days[new Date(s+'T12:00:00').getDay()]; };
const nextTime    = (t) => { const i = TIMES.indexOf(t); return i >= 0 && i < TIMES.length - 1 ? TIMES[i+1] : null; };

/* ============================================================
   HELPERS DE UI
============================================================ */
const TOAST_ICONS = { success:'fa-circle-check', error:'fa-circle-xmark', warning:'fa-triangle-exclamation', info:'fa-bell' };

let toastTimer = null;
function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.className = '';
    el.style.display = 'flex';
    el.classList.add(type);
    document.getElementById('toast-icon').className = `fa-solid ${TOAST_ICONS[type]||'fa-bell'}`;
    document.getElementById('toast-msg').innerText  = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
}

function btnLoad(btn, text = '') {
    if (!btn) return;
    btn._originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div>${text?' '+text:''}`;
}
function btnStop(btn) {
    if (!btn) return;
    btn.disabled = false;
    if (btn._originalHTML) btn.innerHTML = btn._originalHTML;
}

function skelCards(n = 3, type = 'card') {
    const cls = type === 'ticket' ? 'skel-ticket' : 'skel-card';
    return Array(n).fill('').map(() => `<div class="skel ${cls}"></div>`).join('');
}
function skelRows(n = 4) {
    return `<div style="padding:20px 16px">${Array(n).fill('').map((_,i) => `<div class="skel skel-row" style="width:${i%2===0?'80':'60'}%"></div>`).join('')}</div>`;
}
function emptyState(icon, title, text) {
    return `<div class="empty-state"><div class="empty-icon"><i class="fa-solid ${icon}"></i></div><h4>${title}</h4><p>${text}</p></div>`;
}
function shakeInput(el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake','error');
    setTimeout(() => el.classList.remove('shake'), 500);
}

/* ============================================================
   COMPONENTES VISUAIS
============================================================ */
function createProfCard(p) {
    const tag   = p.gender === 'M' ? 'tag-m' : 'tag-f';
    const gText = p.gender === 'M' ? 'MASC' : 'FEM';
    const manicureBadge = p.manicure === 1
        ? `<span style="background:var(--female-bg);color:var(--female-color);padding:2px 8px;border-radius:6px;font-size:0.65rem;font-weight:900;letter-spacing:0.5px"><i class="fa-solid fa-hand-sparkles" style="margin-right:3px;font-size:0.6rem"></i>MANICURE</span>`
        : '';
    const macaBadge = p.maca === 1
        ? `<span class="maca-badge"><i class="fa-solid fa-bed" style="margin-right:3px;font-size:0.6rem"></i>MACA</span>`
        : '';
    return `
    <div class="prof-card scale-in" onclick="startBk('${p.id}')">
        <div class="avatar-box">${getInitials(p.name)}</div>
        <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;flex-wrap:wrap">
                <h3 style="margin:0;font-size:1.05rem">${p.name}</h3>
                <span class="tag ${tag}">${gText}</span>
                ${manicureBadge}${macaBadge}
            </div>
            <p style="color:var(--text-light);font-size:0.88rem;margin-top:3px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.desc || 'Profissional do Espaço Beleza'}</p>
        </div>
        <i class="fa-solid fa-chevron-right prof-arrow"></i>
    </div>`;
}

function createTicket(b, canDelete, colorGender = false) {
    const bc = colorGender ? (b.clientGender==='M' ? 'var(--male-color)' : 'var(--female-color)') : 'var(--accent)';
    const isToday   = b.date === getToday();
    const todayTag  = isToday ? `<span class="tag tag-success" style="font-size:0.62rem;margin-left:4px">HOJE</span>` : '';
    const manTag    = b.manicureType
        ? `<span style="background:var(--female-bg);color:var(--female-color);padding:2px 8px;border-radius:6px;font-size:0.65rem;font-weight:900;margin-left:4px"><i class="fa-solid fa-hand-sparkles" style="margin-right:3px"></i>${MANICURE_LABELS[b.manicureType]||b.manicureType}</span>`
        : '';
    return `
    <div class="bk-ticket fade-in">
        <div style="display:flex;align-items:center;flex:1;min-width:0">
            <div class="bk-bar" style="background:${bc}"></div>
            <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:5px">
                    <div class="bk-time-badge"><i class="fa-solid fa-clock" style="font-size:0.75rem"></i> ${b.time}${b.time2?' + '+b.time2:''}</div>
                    ${todayTag}${manTag}
                </div>
                <div style="font-weight:800;color:var(--primary);font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    ${b.clientName||'Bloqueio'}
                    <small style="color:var(--text-muted);font-weight:400;font-size:0.8rem">${b.clientUnit?' · '+b.clientUnit:''}</small>
                </div>
                <div style="font-size:0.82rem;color:var(--text-light);margin-top:3px">
                    ${fmtDate(b.date)} ${b.profName?'· <b>'+b.profName+'</b>':''} ${b.desc&&b.desc!=='Bloqueio Profissional'?'· '+b.desc:''}
                </div>
            </div>
        </div>
        ${canDelete ? `<button onclick="cancelBk('${b.id}')" class="btn-icon danger" title="Cancelar"><i class="fa-solid fa-trash-can"></i></button>` : ''}
    </div>`;
}

/* ============================================================
   AUTH
============================================================ */
function toggleAuth(m) {
    document.getElementById('form-login').classList.toggle('hidden', m !== 'login');
    document.getElementById('form-reg').classList.toggle('hidden', m !== 'reg');
    const on  = 'flex:1;padding:12px;text-align:center;border-radius:12px;font-weight:800;cursor:pointer;background:white;color:var(--primary);box-shadow:var(--shadow-sm);transition:all 0.25s;font-size:0.85rem;letter-spacing:0.5px';
    const off = 'flex:1;padding:12px;text-align:center;border-radius:12px;cursor:pointer;color:var(--text-muted);font-weight:800;transition:all 0.25s;font-size:0.85rem;letter-spacing:0.5px';
    document.getElementById('tab-login-btn').style.cssText = m==='login' ? on : off;
    document.getElementById('tab-reg-btn').style.cssText   = m==='reg'   ? on : off;
}

async function login() {
    const emailEl = document.getElementById('login-email');
    const passEl  = document.getElementById('login-pass');
    const btn     = document.getElementById('btn-login');
    const e = emailEl.value.trim(), p = passEl.value;
    if (!e || !p) { if(!e) shakeInput(emailEl); if(!p) shakeInput(passEl); return; }
    btnLoad(btn,'Entrando...');
    const users = await API.u.get();
    const u     = users.find(x => x.email===e && x.pass===p);
    if (u) {
        currentUser = u;
        sessionStorage.setItem('pcr_user', JSON.stringify(u));
        document.getElementById('screen-auth').classList.add('hidden');
        document.getElementById('screen-app').classList.remove('hidden');
        updateUserUI();
        if (u.role === 'morador') {
            const gb = document.getElementById('gender-badge');
            gb.innerText = u.gender==='M'?'MASC':'FEM';
            gb.className = `tag ${u.gender==='M'?'tag-m':'tag-f'}`;
        }
        await loadView();
        const m = DB_MSG.get(u.id);
        if (m) { document.getElementById('alert-msg').innerText = m; document.getElementById('modal-alert').style.display='flex'; }
    } else {
        btnStop(btn);
        shakeInput(emailEl); shakeInput(passEl);
        showToast('E-mail ou senha inválidos','error');
    }
}

async function register() {
    const n = document.getElementById('reg-name').value.trim();
    const u = document.getElementById('reg-unit').value.trim();
    const g = document.getElementById('reg-gender').value;
    const e = document.getElementById('reg-email').value.trim();
    const p = document.getElementById('reg-pass').value;
    const btn = document.getElementById('btn-register');
    const fields = [{id:'reg-name',v:n},{id:'reg-unit',v:u},{id:'reg-gender',v:g},{id:'reg-email',v:e},{id:'reg-pass',v:p}];
    let ok = true;
    fields.forEach(f => { if(!f.v){ shakeInput(document.getElementById(f.id)); ok=false; } });
    if (!ok) return showToast('Preencha todos os campos','warning');
    btnLoad(btn,'Cadastrando...');
    await API.u.save({id:'u'+Date.now(), name:n, unit:u, gender:g, email:e, pass:p, role:'morador', desc:'', maca:0, manicure:0});
    btnStop(btn);
    showToast('Cadastro realizado! Faça login.','success');
    toggleAuth('login');
}

function logout() { sessionStorage.removeItem('pcr_user'); location.reload(); }

/* ============================================================
   PERFIL
============================================================ */
function openProfile() {
    document.getElementById('prof-name').value  = currentUser.name  || '';
    document.getElementById('prof-email').value = currentUser.email || '';
    document.getElementById('prof-unit').value  = currentUser.unit  || '';
    document.getElementById('prof-pass').value  = '';
    const descInput = document.getElementById('prof-desc');
    const descLabel = document.getElementById('label-prof-desc');
    if (descInput) {
        descInput.value = currentUser.desc || '';
        const hide = currentUser.role === 'morador';
        descInput.style.display = hide ? 'none' : 'block';
        if (descLabel) descLabel.style.display = hide ? 'none' : 'block';
    }
    document.getElementById('modal-profile').style.display = 'flex';
}

async function saveProfile() {
    const newName  = document.getElementById('prof-name').value.trim();
    const newEmail = document.getElementById('prof-email').value.trim();
    const newUnit  = document.getElementById('prof-unit').value.trim();
    const newPass  = document.getElementById('prof-pass').value;
    const newDesc  = document.getElementById('prof-desc') ? document.getElementById('prof-desc').value : currentUser.desc;
    const btn      = document.getElementById('btn-save-profile');
    if (!newName || !newEmail) {
        if (!newName)  shakeInput(document.getElementById('prof-name'));
        if (!newEmail) shakeInput(document.getElementById('prof-email'));
        return showToast('Nome e E-mail são obrigatórios','warning');
    }
    btnLoad(btn,'Salvando...');
    currentUser.name  = newName;
    currentUser.email = newEmail;
    currentUser.unit  = newUnit;
    if (newPass) currentUser.pass = newPass;
    if (currentUser.role === 'prof') currentUser.desc = newDesc;
    await API.u.save(currentUser);
    sessionStorage.setItem('pcr_user', JSON.stringify(currentUser));
    btnStop(btn);
    updateUserUI();
    showToast('Perfil atualizado!','success');
    document.getElementById('modal-profile').style.display = 'none';
}

function updateUserUI() {
    document.getElementById('user-name').innerText    = currentUser.name.split(' ')[0];
    document.getElementById('user-unit').innerText    = currentUser.unit;
    document.getElementById('pc-user-name').innerText = currentUser.name;
    document.getElementById('pc-user-unit').innerText = currentUser.unit + (currentUser.role==='prof'?' · Prof.':currentUser.role==='admin'?' · Admin':'');
    document.getElementById('pc-avatar').innerText    = getInitials(currentUser.name);
}

/* ============================================================
   NAVEGAÇÃO
============================================================ */
async function loadView() {
    ['view-morador','view-prof','view-admin'].forEach(x => document.getElementById(x).classList.add('hidden'));
    if (currentUser.role === 'morador') {
        document.getElementById('view-morador').classList.remove('hidden');
        await renderProfs();
        await renderMyBks();
    } else if (currentUser.role === 'prof') {
        document.getElementById('view-prof').classList.remove('hidden');
        await renderProfAgenda();
    } else {
        document.getElementById('view-admin').classList.remove('hidden');
        await renderAdmin();
    }
    switchTab('home');
}

async function switchTab(t) {
    document.querySelectorAll('.nav-btn, .sidebar-item').forEach(x => x.classList.remove('active'));
    document.getElementById('mn-'+(t==='home'?'home':'cal'))?.classList.add('active');
    document.getElementById('sb-'+(t==='home'?'home':'cal'))?.classList.add('active');
    document.getElementById('tab-home').classList.toggle('hidden', t !== 'home');
    document.getElementById('tab-calendar').classList.toggle('hidden', t !== 'calendar');
    if (t === 'calendar') { document.getElementById('general-date').value = getToday(); await renderGeneralCalendar(); }
}

/* ============================================================
   MORADOR: PROFISSIONAIS
============================================================ */
async function renderProfs() {
    const container = document.getElementById('list-profs');
    container.innerHTML = skelCards(3,'card');
    const users = await API.u.get();
    const profs = users.filter(u => u.role === 'prof');
    container.innerHTML = profs.length
        ? profs.map(p => createProfCard(p)).join('')
        : emptyState('user-slash','Sem Profissionais','Nenhum profissional cadastrado ainda.');
}

/* ============================================================
   MORADOR: INICIAR AGENDAMENTO (STEP 1 → 2)
============================================================ */
async function startBk(pid) {
    tempBk = { pid, manicureType: null };
    const users = await API.u.get();
    const p     = users.find(x => x.id === pid);
    document.getElementById('sel-prof-name').innerText   = p.name;
    document.getElementById('sel-prof-desc').innerText   = p.desc || 'Profissional do Espaço Beleza';
    document.getElementById('sel-prof-avatar').innerText = getInitials(p.name);
    document.getElementById('date-picker').value         = getToday();
    document.getElementById('booking-desc').value        = '';

    // Seletor de manicure
    const sel = document.getElementById('manicure-selector');
    if (p.manicure === 1) {
        sel.classList.remove('hidden');
        document.querySelectorAll('.manicure-opt').forEach(o => {
            o.style.background  = 'white';
            o.style.borderColor = 'var(--female-border)';
            o.style.boxShadow   = 'none';
            o.style.color       = 'var(--female-color)';
            o.querySelectorAll('*').forEach(c => c.style.color = '');
        });
        document.getElementById('manicure-ambos-tip').classList.add('hidden');
    } else {
        sel.classList.add('hidden');
    }

    document.getElementById('step-prof').classList.add('hidden');
    document.getElementById('step-confirm').classList.add('hidden');
    document.getElementById('step-time').classList.remove('hidden');
    await renderTimeGrid();
}

function backToProfs() {
    document.getElementById('step-prof').classList.remove('hidden');
    document.getElementById('step-time').classList.add('hidden');
    document.getElementById('step-confirm').classList.add('hidden');
    document.getElementById('booking-desc').value = '';
    tempBk = {};
}

function backToTime() {
    document.getElementById('step-confirm').classList.add('hidden');
    document.getElementById('step-time').classList.remove('hidden');
    document.querySelectorAll('.time-slot.selected').forEach(el => el.classList.remove('selected'));
    tempBk.time  = null;
    tempBk.time2 = null;
}

/* ============================================================
   MANICURE: TIPO (Mão / Pé / Ambos)
============================================================ */
function selManicureType(type, el) {
    document.querySelectorAll('.manicure-opt').forEach(o => {
        o.style.background  = 'white';
        o.style.borderColor = 'var(--female-border)';
        o.style.boxShadow   = 'none';
        o.style.color       = 'var(--female-color)';
        o.querySelectorAll('*').forEach(c => c.style.color = '');
    });
    el.style.background  = 'var(--female-color)';
    el.style.borderColor = 'var(--female-color)';
    el.style.color       = 'white';
    el.style.boxShadow   = '0 6px 16px rgba(190,24,93,0.3)';
    el.querySelectorAll('*').forEach(c => c.style.color = 'white');
    tempBk.manicureType = type;
    document.getElementById('manicure-ambos-tip').classList.toggle('hidden', type !== 'ambos');
    renderTimeGrid();
}

/* ============================================================
   GRID DE HORÁRIOS
============================================================ */
async function renderTimeGrid() {
    const grid = document.getElementById('grid-slots');
    const d    = document.getElementById('date-picker').value;
    if (!d) { grid.innerHTML = '<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;padding:20px">Selecione uma data</p>'; return; }
    grid.innerHTML = skelCards(9,'card');
    const users   = await API.u.get();
    const bks     = await API.b.get();
    const p       = users.find(x => x.id === tempBk.pid);
    const isAmbos = p.manicure === 1 && tempBk.manicureType === 'ambos';

    grid.innerHTML = TIMES.map((t, i) => {
        const slot = bks.filter(b => b.date===d && b.time===t);

        // Bloqueado pelo prof ou já tem appt desse prof
        if (slot.find(b => b.profId===p.id && (b.type==='block'||b.type==='appt')))
            return `<div class="time-slot blocked-prof" style="animation-delay:${i*0.04}s"><span>${t}</span><br><small>Ocup.</small></div>`;

        // Maca
        if (p.maca === 1) {
            const macaOcup = slot.some(b => {
                if (b.type!=='appt') return false;
                const profB = users.find(u => u.id===b.profId);
                return profB && profB.maca === 1;
            });
            if (macaOcup) return `<div class="time-slot blocked-maca" style="animation-delay:${i*0.04}s"><i class="fa-solid fa-bed" style="font-size:0.7rem"></i><br>MACA</div>`;
        }

        // Gênero
        const act = slot.find(b => b.type==='appt');
        if (act && act.clientGender !== currentUser.gender)
            return `<div class="time-slot ${act.clientGender==='M'?'blocked-male':'blocked-female'}" style="animation-delay:${i*0.04}s">
                        ${act.clientGender==='M'?'<i class="fa-solid fa-mars"></i>':'<i class="fa-solid fa-venus"></i>'}<br>
                        ${act.clientGender==='M'?'MASC':'FEM'}</div>`;

        // AMBOS: precisa de 2 slots consecutivos livres
        if (isAmbos) {
            const next = nextTime(t);
            if (!next) return `<div class="time-slot blocked-prof" style="animation-delay:${i*0.04}s;font-size:0.68rem">${t}<br><small>Insuf.</small></div>`;
            const slotNext = bks.filter(b => b.date===d && b.time===next);
            const nextLivre = !slotNext.find(b => b.profId===p.id && (b.type==='block'||b.type==='appt'))
                           && !slotNext.find(b => b.type==='appt' && b.clientGender!==currentUser.gender);
            if (!nextLivre) return `<div class="time-slot blocked-prof" style="animation-delay:${i*0.04}s;font-size:0.68rem">${t}<br><small>Par indispon.</small></div>`;
            return `<div class="time-slot" style="animation-delay:${i*0.04}s" onclick="selTime('${t}',this)">${t}<br><small style="font-size:0.62rem;opacity:0.7">+${next}</small></div>`;
        }

        return `<div class="time-slot" style="animation-delay:${i*0.04}s" onclick="selTime('${t}',this)">${t}</div>`;
    }).join('');
}

/* ============================================================
   SELECIONAR HORÁRIO → STEP 3
============================================================ */
function selTime(t, el) {
    document.querySelectorAll('.time-slot').forEach(x => x.classList.remove('selected'));
    el.classList.add('selected');
    tempBk.time  = t;
    tempBk.time2 = tempBk.manicureType === 'ambos' ? nextTime(t) : null;
    setTimeout(() => showConfirmStep(), 280);
}

async function showConfirmStep() {
    const users   = await API.u.get();
    const p       = users.find(x => x.id === tempBk.pid);
    const d       = document.getElementById('date-picker').value;
    const service = document.getElementById('booking-desc').value.trim() || 'Atendimento';
    document.getElementById('conf-prof-name').innerText = p.name;
    document.getElementById('conf-service').innerText   = service;
    document.getElementById('conf-date').innerHTML      = `${fmtDate(d)} <span style="color:var(--text-muted);font-weight:400;font-size:0.82rem">(${dayName(d)})</span>`;
    document.getElementById('conf-time').innerText      = tempBk.time2 ? `${tempBk.time} + ${tempBk.time2}` : tempBk.time;
    document.getElementById('conf-unit').innerText      = `${currentUser.name} · ${currentUser.unit}`;
    const manicureRow = document.getElementById('conf-manicure-row');
    const manicureVal = document.getElementById('conf-manicure-type');
    if (tempBk.manicureType) {
        manicureRow.style.display = 'flex';
        manicureVal.innerText = MANICURE_LABELS[tempBk.manicureType] || tempBk.manicureType;
    } else {
        manicureRow.style.display = 'none';
    }
    document.getElementById('step-time').classList.add('hidden');
    document.getElementById('step-confirm').classList.remove('hidden');
}

/* ============================================================
   CONFIRMAR AGENDAMENTO
============================================================ */
async function confirmBooking() {
    const btn = document.getElementById('btn-confirm-final');
    btnLoad(btn,'Reservando...');
    const users  = await API.u.get();
    const p      = users.find(x => x.id === tempBk.pid);
    const d      = document.getElementById('date-picker').value;
    const svc    = document.getElementById('booking-desc').value.trim() || 'Atendimento';
    const pairId = tempBk.time2 ? 'pair_'+Date.now() : null;

    const base = {
        date: d, profId: p.id, profName: p.name,
        clientId: currentUser.id, clientName: currentUser.name,
        clientUnit: currentUser.unit, clientGender: currentUser.gender,
        desc: svc, type: 'appt',
        manicureType: tempBk.manicureType || null,
        pairId
    };

    // Salva o horário principal (com time2 para exibição no ticket)
    await API.b.save({ ...base, time: tempBk.time, time2: tempBk.time2 || null });

    // Se "Ambos", salva o segundo horário separado (sem time2)
    if (tempBk.time2) {
        await API.b.save({ ...base, time: tempBk.time2, time2: null });
    }

    btnStop(btn);
    showToast(tempBk.time2 ? 'Agendamento duplo confirmado!' : 'Agendamento confirmado!','success');
    backToProfs();
    await renderMyBks();
}

/* ============================================================
   MINHAS RESERVAS
============================================================ */
async function renderMyBks() {
    const actContainer = document.getElementById('my-bookings-active');
    const hisContainer = document.getElementById('my-bookings-history');
    actContainer.innerHTML = skelCards(2,'ticket');
    const bks   = await API.b.get();
    const myBks = bks.filter(b => b.clientId===currentUser.id && b.type==='appt');

    // Deduplicar pares (mostrar só o registro com time2)
    const seen    = new Set();
    const deduped = myBks.filter(b => {
        if (b.pairId) { if (seen.has(b.pairId)) return false; seen.add(b.pairId); }
        return true;
    });

    const act = deduped.filter(b => !isPast(b.date)).sort((a,b) => a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
    const his = deduped.filter(b =>  isPast(b.date)).sort((a,b) => b.date.localeCompare(a.date));

    actContainer.innerHTML = act.length
        ? act.map(b => createTicket(b,true)).join('')
        : emptyState('calendar-plus','Sem agendamentos','Escolha um profissional e faça sua reserva!');
    hisContainer.innerHTML = his.length
        ? his.map(b => createTicket(b,false)).join('')
        : emptyState('clock-rotate-left','Sem histórico','Seus atendimentos passados aparecerão aqui.');
}

/* ============================================================
   PROFISSIONAL: BLOQUEIOS
============================================================ */
async function renderBlockTimes() {
    const d    = document.getElementById('block-date').value;
    const grid = document.getElementById('block-grid');
    if (!d) return;
    grid.innerHTML = skelCards(9,'card');
    const bks = await API.b.get();
    grid.innerHTML = TIMES.map((t,i) => {
        const b   = bks.find(x => x.date===d && x.time===t && x.profId===currentUser.id);
        const cls = b ? 'blocked-prof' : '';
        const clk = !b ? `onclick="this.classList.toggle('selected')"` : '';
        const lbl = b ? `${t}<br><small>Bloq.</small>` : t;
        return `<div class="time-slot ${cls}" ${clk} style="animation-delay:${i*0.04}s">${lbl}</div>`;
    }).join('');
}

async function saveBlock() {
    const d    = document.getElementById('block-date').value;
    const els  = document.querySelectorAll('#block-grid .selected');
    const btn  = document.getElementById('btn-save-block');
    if (!d || !els.length) return showToast('Selecione a data e ao menos um horário','warning');
    btnLoad(btn,'Salvando...');
    for (let e of els) {
        await API.b.save({date:d, time:e.innerText.trim(), profId:currentUser.id, profName:currentUser.name, type:'block', desc:'Bloqueio Profissional'});
    }
    btnStop(btn);
    showToast(`${els.length} horário(s) bloqueado(s)`,'success');
    await renderBlockTimes();
    await renderProfAgenda();
}

async function renderProfAgenda() {
    const actContainer = document.getElementById('prof-list-active');
    const blkContainer = document.getElementById('prof-list-blocks');
    const hisContainer = document.getElementById('prof-list-history');
    actContainer.innerHTML = skelCards(2,'ticket');
    const bks = await API.b.get();
    const all = bks.filter(b => b.profId===currentUser.id);
    const act = all.filter(b => !isPast(b.date));

    const seen = new Set();
    const actAppts = act.filter(b => {
        if (b.type!=='appt') return false;
        if (b.pairId) { if (seen.has(b.pairId)) return false; seen.add(b.pairId); }
        return true;
    }).sort((a,b) => a.date.localeCompare(b.date)||a.time.localeCompare(b.time));

    actContainer.innerHTML = actAppts.length
        ? actAppts.map(b => createTicket(b,true,true)).join('')
        : emptyState('calendar-xmark','Agenda Livre','Nenhum atendimento agendado.');

    const bl = act.filter(b => b.type==='block');
    const gr = bl.reduce((a,b) => { (a[b.date]=a[b.date]||[]).push(b); return a; }, {});
    blkContainer.innerHTML = Object.keys(gr).sort().map(d => `
        <div style="margin-bottom:10px;padding:14px 16px;background:white;border-radius:14px;border:1px solid var(--border);box-shadow:var(--shadow-sm)">
            <div style="margin-bottom:10px"><span class="date-badge">${fmtDate(d)} · ${dayName(d)}</span></div>
            <div style="display:flex;flex-wrap:wrap">
                ${gr[d].map(k=>`<span class="block-tag" onclick="cancelBk('${k.id}')"><i class="fa-solid fa-clock" style="font-size:0.65rem"></i> ${k.time} <i class="fa-solid fa-xmark" style="font-size:0.65rem"></i></span>`).join('')}
            </div>
        </div>`).join('') || '<p style="color:var(--text-muted);font-size:0.88rem;padding:8px 0">Nenhum bloqueio ativo</p>';

    const seen2 = new Set();
    const hisAppts = all.filter(b => {
        if (!isPast(b.date)||b.type!=='appt') return false;
        if (b.pairId) { if (seen2.has(b.pairId)) return false; seen2.add(b.pairId); }
        return true;
    }).sort((a,b) => b.date.localeCompare(a.date));

    hisContainer.innerHTML = hisAppts.length
        ? hisAppts.map(b => createTicket(b,false)).join('')
        : emptyState('clock-rotate-left','Sem histórico','Atendimentos passados aparecerão aqui.');
}

/* ============================================================
   ADMIN
============================================================ */
async function renderAdminUsers() {
    const s    = document.getElementById('admin-search').value.toLowerCase();
    const wrap = document.getElementById('admin-user-list');
    wrap.innerHTML = skelRows(4);
    const users = await API.u.get();
    const list  = users.filter(x => x.role!=='admin' && (x.name.toLowerCase().includes(s)||(x.unit||'').toLowerCase().includes(s)));
    if (!list.length) { wrap.innerHTML = emptyState('magnifying-glass','Sem resultados','Nenhum usuário encontrado.'); return; }
    wrap.innerHTML = list.map(x => `
        <div class="admin-user-item">
            <div style="display:flex;gap:12px;align-items:center;min-width:0">
                <div class="avatar-box xsmall">${getInitials(x.name)}</div>
                <div style="min-width:0">
                    <div style="font-weight:800;font-size:0.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                        ${x.name}
                        ${x.maca===1?'<span class="maca-badge">MACA</span>':''}
                        ${x.manicure===1?'<span style="background:var(--female-bg);color:var(--female-color);padding:2px 7px;border-radius:6px;font-size:0.6rem;font-weight:900;margin-left:4px"><i class="fa-solid fa-hand-sparkles"></i> MANICURE</span>':''}
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;margin-top:3px;flex-wrap:wrap">
                        <small style="color:var(--accent);font-weight:800">${x.unit}</small>
                        <span class="tag tag-role" style="font-size:0.6rem;padding:2px 7px">${x.role.toUpperCase()}</span>
                        <span class="tag ${x.gender==='M'?'tag-m':'tag-f'}" style="font-size:0.6rem;padding:2px 7px">${x.gender==='M'?'MASC':'FEM'}</span>
                    </div>
                </div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0">
                <button class="btn-icon" onclick="adminEditUser('${x.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon danger" onclick="delUser('${x.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>`).join('');
}

function debounceSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(() => renderAdminUsers(), 350); }

async function renderAdmin() {
    await renderAdminUsers();
    const bks = await API.b.get();
    const actContainer = document.getElementById('admin-list-active');
    actContainer.innerHTML = skelCards(3,'ticket');
    const seen = new Set();
    const actBks = bks.filter(b => {
        if (b.type!=='appt'||isPast(b.date)) return false;
        if (b.pairId) { if(seen.has(b.pairId)) return false; seen.add(b.pairId); }
        return true;
    }).sort((a,b) => a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
    actContainer.innerHTML = actBks.length
        ? actBks.map(b => createTicket(b,true,true)).join('')
        : emptyState('calendar-xmark','Nenhuma reserva ativa','Ainda não há agendamentos futuros.');
    const seen2 = new Set();
    const hisBks = bks.filter(b => {
        if (b.type!=='appt'||!isPast(b.date)) return false;
        if (b.pairId) { if(seen2.has(b.pairId)) return false; seen2.add(b.pairId); }
        return true;
    }).sort((a,b) => b.date.localeCompare(a.date));
    document.getElementById('admin-list-history').innerHTML = hisBks.length
        ? hisBks.map(b => createTicket(b,false,true)).join('')
        : emptyState('clock-rotate-left','Sem histórico','Atendimentos passados aparecerão aqui.');
}

async function adminEditUser(id) {
    document.getElementById('modal-admin-user').style.display = 'flex';
    let u = {id:'',name:'',unit:'',email:'',pass:'',role:'morador',gender:'M',desc:'',maca:0,manicure:0};
    if (id) { const users = await API.u.get(); u = users.find(x => x.id===id)||u; }
    document.getElementById('adm-uid').value        = u.id     || '';
    document.getElementById('adm-name').value       = u.name   || '';
    document.getElementById('adm-unit').value       = u.unit   || '';
    document.getElementById('adm-email').value      = u.email  || '';
    document.getElementById('adm-pass').value       = u.pass   || '';
    document.getElementById('adm-role').value       = u.role   || 'morador';
    document.getElementById('adm-gender').value     = u.gender || 'M';
    document.getElementById('adm-desc').value       = u.desc   || '';
    document.getElementById('adm-maca').checked     = (u.maca     === 1);
    document.getElementById('adm-manicure').checked = (u.manicure === 1);
}

async function adminSaveUser() {
    const n   = document.getElementById('adm-name').value.trim();
    const u   = document.getElementById('adm-unit').value.trim();
    const e   = document.getElementById('adm-email').value.trim();
    const p   = document.getElementById('adm-pass').value;
    const r   = document.getElementById('adm-role').value;
    const g   = document.getElementById('adm-gender').value;
    const id  = document.getElementById('adm-uid').value;
    const d   = document.getElementById('adm-desc').value||'';
    const m   = document.getElementById('adm-maca').checked     ? 1 : 0;
    const man = document.getElementById('adm-manicure').checked ? 1 : 0;
    const btn = document.getElementById('btn-admin-save-user');
    if (!n||!e||!p) {
        if(!n) shakeInput(document.getElementById('adm-name'));
        if(!e) shakeInput(document.getElementById('adm-email'));
        if(!p) shakeInput(document.getElementById('adm-pass'));
        return showToast('Nome, E-mail e Senha são obrigatórios','warning');
    }
    btnLoad(btn,'Salvando...');
    await API.u.save({id:id||'u'+Date.now(), name:n, unit:u, email:e, pass:p, role:r, gender:g, desc:d, maca:m, manicure:man});
    btnStop(btn);
    showToast('Usuário salvo!','success');
    document.getElementById('modal-admin-user').style.display = 'none';
    await renderAdmin();
}

async function delUser(id) {
    if (!confirm('Excluir este usuário permanentemente?')) return;
    await API.u.del(id); showToast('Usuário removido','info'); await renderAdmin();
}

/* ============================================================
   CANCELAMENTOS
============================================================ */
async function cancelBk(id) {
    const bks = await API.b.get();
    const b   = bks.find(x => String(x.id)===String(id));
    if (!b) return showToast('Reserva não encontrada','error');
    if (currentUser.role === 'morador') {
        if (confirm('Cancelar sua reserva?')) await doCancel(id, null, b.pairId);
    } else if (b.type === 'appt') {
        pendingCancelId = id;
        document.getElementById('cancel-reason').value = '';
        document.getElementById('modal-cancel').style.display = 'flex';
    } else {
        if (confirm('Remover este bloqueio?')) await doCancel(id, null, null);
    }
}

async function finalizeCancel() {
    const btn = document.getElementById('btn-cancel-confirm');
    btnLoad(btn,'Cancelando...');
    const bks = await API.b.get();
    const b   = bks.find(x => String(x.id)===String(pendingCancelId));
    await doCancel(pendingCancelId, document.getElementById('cancel-reason').value, b?.pairId);
    btnStop(btn);
    document.getElementById('modal-cancel').style.display = 'none';
}

function closeCancelModal() { document.getElementById('modal-cancel').style.display = 'none'; }

async function doCancel(id, reason, pairId) {
    const bks = await API.b.get();
    const bk  = bks.find(x => String(x.id)===String(id));
    if (bk && bk.type==='appt' && currentUser.role!=='morador') {
        DB_MSG.add(bk.clientId, `Sua reserva de ${bk.time} em ${fmtDate(bk.date)} foi cancelada.${reason?' Motivo: '+reason:''}`);
    }
    await API.b.del(id);
    // Cancela o segundo slot do par (manicure ambos)
    if (pairId) {
        const pair = bks.find(x => x.pairId===pairId && String(x.id)!==String(id));
        if (pair) await API.b.del(pair.id);
    }
    showToast('Reserva cancelada','info');
    await loadView();
}

/* ============================================================
   AGENDA GERAL — com indicador de maca e manicure
============================================================ */
async function renderGeneralCalendar() {
    const d    = document.getElementById('general-date').value;
    const cont = document.getElementById('general-timeline');
    cont.innerHTML = skelRows(9);
    const users  = await API.u.get();
    const bks    = await API.b.get();
    const dayBks = bks.filter(b => b.date===d);

    // Deduplicar pares no calendário geral
    const seen = new Set();
    const dedupedDay = dayBks.filter(b => {
        if (b.type==='appt' && b.pairId) { if(seen.has(b.pairId)) return false; seen.add(b.pairId); }
        return true;
    });

    cont.innerHTML = TIMES.map(t => {
        const slots = dedupedDay.filter(x => x.time===t);
        let content;
        if (!slots.length) {
            content = `<span style="color:var(--text-muted);font-size:0.85rem;font-style:italic">Disponível</span>`;
        } else {
            content = slots.map(x => {
                const profData = users.find(u => u.id===x.profId);
                const macaTag  = profData?.maca===1
                    ? `<span style="background:#fffbeb;color:var(--warning);padding:1px 6px;border-radius:5px;font-size:0.6rem;font-weight:900;margin-left:4px"><i class="fa-solid fa-bed"></i> MACA</span>`
                    : '';
                if (x.type === 'block')
                    return `<span class="tag" style="background:#f1f5f9;color:#94a3b8"><i class="fa-solid fa-lock" style="margin-right:4px;font-size:0.6rem"></i>${x.profName} · Bloqueio${macaTag}</span>`;
                const manTag = x.manicureType
                    ? `<span style="background:var(--female-bg);color:var(--female-color);padding:1px 5px;border-radius:4px;font-size:0.58rem;font-weight:900;margin-left:3px"><i class="fa-solid fa-hand-sparkles"></i> ${MANICURE_LABELS[x.manicureType]||x.manicureType}</span>`
                    : '';
                const cls = x.clientGender==='M'?'tag-m':'tag-f';
                const timeLabel = x.time2 ? `${x.time}+${x.time2}` : x.time;
                return `<span class="tag ${cls}"><b>${timeLabel}</b> · ${x.profName} · ${x.clientName} (${x.clientUnit})${macaTag}${manTag}</span>`;
            }).join(' ');
        }
        return `<div class="timeline-row"><div class="timeline-time">${t}</div><div class="timeline-content">${content}</div></div>`;
    }).join('');
}

/* ============================================================
   HISTÓRICO TOGGLE
============================================================ */
function toggleHistory(role) {
    const id  = role==='morador'?'my-bookings-history':role==='prof'?'prof-list-history':'admin-list-history';
    const el  = document.getElementById(id);
    const btn = el.previousElementSibling;
    el.classList.toggle('hidden');
    if (!el.classList.contains('hidden')) {
        el.classList.add('fade-in');
        if (btn?.classList.contains('history-toggle')) btn.innerHTML = '<i class="fa-solid fa-chevron-up" style="margin-right:6px"></i> Ocultar Histórico';
    } else {
        if (btn?.classList.contains('history-toggle')) btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left" style="margin-right:6px"></i> Ver Histórico';
    }
}

/* ============================================================
   INICIALIZAÇÃO
============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    const dp = document.getElementById('date-picker');
    const bd = document.getElementById('block-date');
    if (dp) dp.min = getToday();
    if (bd) bd.min = getToday();
});

if (currentUser) {
    document.getElementById('screen-auth').classList.add('hidden');
    document.getElementById('screen-app').classList.remove('hidden');
    updateUserUI();
    if (currentUser.role === 'morador') {
        const gb = document.getElementById('gender-badge');
        gb.innerText = currentUser.gender==='M'?'MASC':'FEM';
        gb.className = `tag ${currentUser.gender==='M'?'tag-m':'tag-f'}`;
    }
    loadView();
}
