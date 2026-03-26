function initTheme() {
    const savedTheme = localStorage.getItem('appTheme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('appTheme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if(btn) btn.innerText = theme === 'dark' ? '☀️' : '🌙';
}

initTheme(); // Run on load

const SUPABASE_URL = 'https://exkcygcpzoubwhrrdfll.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_54di3nOCy1qBeXV08fNFMA_qMrc1K3l'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. STATE ---
let nav = 0;
let clickedDate = null;
let editingEventId = null; 
let currentUser = { isLoggedIn: false, clubName: '', userName: '', color: '#3498db' };
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// --- 3. DYNAMIC CLUB LIST ---
async function fetchClubsIntoDropdown() {
    const dropdown = document.getElementById('loginClub');
    dropdown.innerHTML = '<option value="" disabled selected>Select Your Club</option>';
    const { data: users } = await _supabase.from('users').select('club_name');
    if (users) {
        const uniqueClubs = [...new Set(users.map(u => u.club_name))];
        uniqueClubs.forEach(clubName => {
            const option = document.createElement('option');
            option.value = clubName;
            option.innerText = clubName;
            dropdown.appendChild(option);
        });
    }
}

// --- 4. AUTHENTICATION ---
function showLoginModal() {
    fetchClubsIntoDropdown();
    document.getElementById('loginModal').style.display = 'block';
    document.getElementById('modalBackdrop').style.display = 'block';
}

async function handleAuth() {
    const club = document.getElementById('loginClub').value;
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value;

    const { data } = await _supabase
        .from('users')
        .select('club_name, username, password, club_color')
        .eq('club_name', club)
        .eq('username', user)
        .eq('password', pass)
        .maybeSingle();

    if (data) {
        currentUser = { 
            isLoggedIn: true, 
            clubName: club, 
            userName: user, 
            color: data.club_color || '#3498db' 
        };
        document.getElementById('login-trigger-btn').classList.add('hidden');
        document.getElementById('admin-controls').classList.remove('hidden');
        document.getElementById('admin-msg').innerText = `${user} (${club})`;
        localStorage.setItem('clubSession', JSON.stringify(currentUser));
        closeAllModals();
        load();
    } else {
        alert("Invalid login details.");
    }
}

function logout() {
    localStorage.removeItem('clubSession');
    currentUser = { isLoggedIn: false, clubName: '', userName: '', color: '#3498db' };
    document.getElementById('login-trigger-btn').classList.remove('hidden');
    document.getElementById('admin-controls').classList.add('hidden');
    load();
}

// --- 5. CALENDAR LOGIC ---
async function load() {
    const dt = new Date();
    if (nav !== 0) dt.setMonth(new Date().getMonth() + nav);

    const month = dt.getMonth();
    const year = dt.getFullYear();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dateString = firstDay.toLocaleDateString('en-us', { weekday: 'long' });
    const paddingDays = weekdays.indexOf(dateString);

    document.getElementById('monthDisplay').innerText = 
        `${dt.toLocaleDateString('en-us', { month: 'long' })} ${year}`;

    const { data: allEvents } = await _supabase.from('events').select('*');
    const calendar = document.getElementById('calendar');
    calendar.innerHTML = ''; 
        
    for(let i = 1; i <= paddingDays + daysInMonth; i++) {
        const daySquare = document.createElement('div');
        daySquare.classList.add('day');
        const dayString = `${month + 1}/${i - paddingDays}/${year}`;

        if (i > paddingDays) {
            daySquare.innerText = i - paddingDays;
            const dayEvents = allEvents ? allEvents.filter(e => e.date === dayString) : [];
            
            if (dayEvents.length > 0) {
                const marker = document.createElement('div');
                marker.classList.add('event-marker');
                marker.innerText = `${dayEvents.length} Event(s)`;
                daySquare.appendChild(marker);
            }
            daySquare.onclick = () => openModal(dayString, dayEvents);
        } else {
            daySquare.classList.add('padding');
        }
        calendar.appendChild(daySquare);
    }
}

function openModal(date, dayEvents) {
    clickedDate = date;
    editingEventId = null; 
    document.getElementById('modalDateTitle').innerText = `Events: ${date}`;
    const adminForm = document.getElementById('admin-only-form');
    
    if (currentUser.isLoggedIn) {
        adminForm.classList.remove('hidden');
        document.getElementById('posting-as').innerText = `Posting as: ${currentUser.clubName}`;
        document.querySelector('#admin-only-form .success').innerText = "Save Event";
    } else {
        adminForm.classList.add('hidden');
    }

    renderEventList(dayEvents);
    document.getElementById('newEventModal').style.display = 'block';
    document.getElementById('modalBackdrop').style.display = 'block';
}

function renderEventList(dayEvents) {
    const list = document.getElementById('existing-events-list');
    list.innerHTML = dayEvents.length === 0 ? '<p>No events today.</p>' : '';
    
    dayEvents.forEach(e => {
        const active = isEventActive(e.date, e.end_time);
        const item = document.createElement('div');
        item.className = 'event-item-detailed';
        if (!active) item.style.opacity = "0.7";

        const isOwner = currentUser.isLoggedIn && 
                        e.club_name && 
                        currentUser.clubName &&
                        e.club_name.trim() === currentUser.clubName.trim();
        
        const statusBadge = active 
            ? `<span style="color: #27ae60; font-size: 11px; font-weight: bold; margin-bottom: 5px; display: block;">● Available</span>` 
            : `<span style="color: #e74c3c; font-size: 11px; font-weight: bold; margin-bottom: 5px; display: block;">● Expired</span>`;

        const eventColor = e.club_color || '#3498db';
        const timeDisplay = `<div class="event-time-tag">🕒 ${e.start_time || ''} - ${e.end_time || ''}</div>`;
        const imageTag = e.image_url ? `<img src="${e.image_url}" style="width: 100%; border-radius: 8px; margin-bottom: 10px; display: block;">` : '';

        item.innerHTML = `
            <div style="flex-grow: 1;">
                ${statusBadge}
                ${imageTag}
                ${timeDisplay}
                <div class="event-item-header"><strong style="color: ${eventColor};">${e.club_name}</strong>: ${e.title}</div>
                <div class="event-item-desc">${e.description || 'No description provided.'}</div>
            </div>
            ${isOwner ? `
                <div style="display: flex; flex-direction: column; gap: 5px; margin-left: 10px;">
                    <button class="edit-btn" onclick="prepareEdit('${e.id}', '${e.title.replace(/'/g, "\\'")}', '${e.description ? e.description.replace(/'/g, "\\'") : ''}')">Edit</button>
                    <button class="del-btn" onclick="deleteEvent('${e.id}')">Delete</button>
                </div>
            ` : ''}
        `;
        list.appendChild(item);
    });
}

function isEventActive(eventDateStr, endTimeStr) {
    if (!eventDateStr || !endTimeStr) return true;
    const now = new Date();
    const [month, day, year] = eventDateStr.split('/').map(Number);
    const eventDate = new Date(year, month - 1, day);
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (eventDate < todayDate) return false; 
    if (eventDate > todayDate) return true;  

    const [time, modifier] = endTimeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    const endDateTime = new Date(year, month - 1, day, hours, minutes);
    return now < endDateTime;
}

function prepareEdit(id, title, desc) {
    editingEventId = id;
    document.getElementById('eventTitleInput').value = title;
    document.getElementById('eventDescInput').value = desc;
    const saveBtn = document.querySelector('#admin-only-form .success');
    saveBtn.innerText = "Update Event Info";
    saveBtn.scrollIntoView({ behavior: 'smooth' });
}

async function saveEvent() {
    const title = document.getElementById('eventTitleInput').value;
    const desc = document.getElementById('eventDescInput').value;
    const rawStart = document.getElementById('startTimeInput').value;
    const rawEnd = document.getElementById('endTimeInput').value;
    const imageInput = document.getElementById('eventImageInput');
    const imageFile = imageInput.files[0];

    if (!title) { alert("Please provide at least an Event Title."); return; }

    let imageUrl = null;
    try {
        if (imageFile) {
            const fileName = `${Date.now()}_${imageFile.name.replace(/\s/g, '_')}`;
            const { data: uploadData, error: uploadError } = await _supabase.storage.from('event-posters').upload(fileName, imageFile);
            if (!uploadError) {
                const { data: publicUrlData } = _supabase.storage.from('event-posters').getPublicUrl(fileName);
                imageUrl = publicUrlData.publicUrl;
            }
        }

        const eventData = {
            title: title,
            description: desc,
            club_name: currentUser.clubName,
            club_color: currentUser.color,
            date: clickedDate
        };

        if (rawStart) eventData.start_time = formatTo12Hour(rawStart);
        if (rawEnd) eventData.end_time = formatTo12Hour(rawEnd);
        if (imageUrl) eventData.image_url = imageUrl;

        let error;
        if (editingEventId) {
            const { error: updateError } = await _supabase.from('events').update(eventData).eq('id', editingEventId);
            error = updateError;
        } else {
            const { error: insertError } = await _supabase.from('events').insert([eventData]);
            error = insertError;
        }

        if (error) throw error;
        closeAllModals();
        load(); 
    } catch (err) { alert("Error saving event: " + err.message); }
}

function formatTo12Hour(timeString) {
    if (!timeString) return '';
    let [hours, minutes] = timeString.split(':');
    let ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
}

async function deleteEvent(id) {
    if (!confirm("Are you sure?")) return;
    const { error } = await _supabase.from('events').delete().eq('id', id);
    if (!error) { closeAllModals(); load(); }
}

function initJumpToDate() {
    const m = document.getElementById('jumpMonth');
    const y = document.getElementById('jumpYear');
    const currentYear = new Date().getFullYear();
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    months.forEach((name, i) => {
        let opt = document.createElement('option');
        opt.value = i; opt.innerText = name;
        if (i === new Date().getMonth()) opt.selected = true;
        m.appendChild(opt);
    });
    for (let i = currentYear - 2; i <= currentYear + 3; i++) {
        let opt = document.createElement('option');
        opt.value = i; opt.innerText = i;
        if (i === currentYear) opt.selected = true;
        y.appendChild(opt);
    }
}

function jumpToDate() {
    const m = parseInt(document.getElementById('jumpMonth').value);
    const y = parseInt(document.getElementById('jumpYear').value);
    const now = new Date();
    nav = (y - now.getFullYear()) * 12 + (m - now.getMonth());
    load();
}

function closeAllModals() {
    editingEventId = null;
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    document.getElementById('modalBackdrop').style.display = 'none';
    document.getElementById('eventTitleInput').value = '';
    document.getElementById('eventDescInput').value = '';
    document.getElementById('startTimeInput').value = '';
    document.getElementById('endTimeInput').value = '';
    document.getElementById('eventImageInput').value = '';
}

document.getElementById('backButton').onclick = () => { nav--; load(); };
document.getElementById('nextButton').onclick = () => { nav++; load(); };

initJumpToDate();
const session = localStorage.getItem('clubSession');
if (session) {
    currentUser = JSON.parse(session);
    document.getElementById('login-trigger-btn').classList.add('hidden');
    document.getElementById('admin-controls').classList.remove('hidden');
    document.getElementById('admin-msg').innerText = `${currentUser.userName} (${currentUser.clubName})`;
}
load();
