// --- 1. SUPABASE CONFIG ---
const SUPABASE_URL = 'https://exkcygcpzoubwhrrdfll.supabase.co'; // Replace with yours
const SUPABASE_KEY = 'sb_publishable_54di3nOCy1qBeXV08fNFMA_qMrc1K3l'; // Replace with yours
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. STATE ---
let nav = 0;
let clickedDate = null;
let currentUser = { isLoggedIn: false, clubName: '', userName: '' };
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// --- 3. DYNAMIC CLUB LIST ---
async function fetchClubsIntoDropdown() {
    const dropdown = document.getElementById('loginClub');
    dropdown.innerHTML = '<option value="" disabled selected>Select Your Club</option>';
    
    const { data: users, error } = await _supabase.from('users').select('club_name');

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

    const { data, error } = await _supabase
        .from('users')
        .select('*')
        .eq('club_name', club)
        .eq('username', user)
        .eq('password', pass)
        .maybeSingle();

    if (data) {
        currentUser = { isLoggedIn: true, clubName: club, userName: user };
        document.getElementById('login-trigger-btn').classList.add('hidden');
        document.getElementById('admin-controls').classList.remove('hidden');
        document.getElementById('admin-msg').innerText = `${user} (${club})`;
        closeAllModals();
        load();
    } else {
        alert("Invalid login details.");
    }
}

function logout() {
    currentUser = { isLoggedIn: false, clubName: '', userName: '' };
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
    document.getElementById('modalDateTitle').innerText = `Events: ${date}`;
    const adminForm = document.getElementById('admin-only-form');
    
    if (currentUser.isLoggedIn) {
        adminForm.classList.remove('hidden');
        document.getElementById('posting-as').innerText = `Posting as: ${currentUser.clubName}`;
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
        const item = document.createElement('div');
        item.className = 'event-item-detailed';
        
        // DEBUG: Uncomment the line below if buttons still don't show
        // console.log("Event:", e.title, "ID:", e.id, "Club:", e.club_name, "User:", currentUser.clubName);

        // Improved logic: Trim spaces and ensure both exist
        const canDelete = currentUser.isLoggedIn && 
                          e.club_name && 
                          currentUser.clubName &&
                          e.club_name.trim() === currentUser.clubName.trim();
        
        const timeDisplay = e.start_time ? 
            `<div class="event-time-tag">🕒 ${e.start_time} - ${e.end_time}</div>` : '';
        
        const imageTag = e.image_url ? 
            `<img src="${e.image_url}" style="width: 100%; border-radius: 8px; margin-bottom: 10px; display: block;">` : '';

        item.innerHTML = `
            <div style="flex-grow: 1;">
                ${imageTag}
                ${timeDisplay}
                <div class="event-item-header"><strong>${e.club_name}</strong>: ${e.title}</div>
                <div class="event-item-desc">${e.description || ''}</div>
            </div>
            ${canDelete ? `<button class="del-btn" onclick="deleteEvent('${e.id}')">Delete</button>` : ''}
        `;
        list.appendChild(item);
    });
}
async function saveEvent() {
    const title = document.getElementById('eventTitleInput').value;
    const imageFile = document.getElementById('eventImageInput').files[0];
    let imageUrl = null;

    // 1. Upload the image if one was selected
    if (imageFile) {
        const fileName = `${Date.now()}_${imageFile.name}`;
        const { data, error: uploadError } = await _supabase.storage
            .from('event-posters')
            .upload(fileName, imageFile);

        if (uploadError) {
            alert("Image upload failed!");
            return;
        }

        // 2. Get the Public URL
        const { data: publicUrlData } = _supabase.storage
            .from('event-posters')
            .getPublicUrl(fileName);
        
        imageUrl = publicUrlData.publicUrl;
    }

    // 3. Save everything to the database
    const { error } = await _supabase
        .from('events')
        .insert([{ 
            title: title,
            image_url: imageUrl, // Save the link here
            club_name: currentUser.clubName,
            date: clickedDate,
            // ... (rest of your fields)
        }]);
    
    // ... (rest of your cleanup logic)
}
function formatTo12Hour(timeString) {
    if (!timeString) return '';
    let [hours, minutes] = timeString.split(':');
    let ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    return `${hours}:${minutes} ${ampm}`;
}
async function deleteEvent(id) {
    if (!confirm("Are you sure you want to permanently delete this event?")) return;

    try {
        console.log("Starting deletion for event ID:", id);

        // 1. Fetch the event first to get the image URL
        const { data: event, error: fetchError } = await _supabase
            .from('events')
            .select('image_url')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // 2. If there's an image, delete it from Supabase Storage
        if (event && event.image_url) {
            console.log("Deleting associated image...");
            
            // Extract the filename from the URL
            // Example URL: .../storage/v1/object/public/event-posters/123_image.png
            const urlParts = event.image_url.split('/');
            const fileName = urlParts[urlParts.length - 1];

            const { error: storageError } = await _supabase.storage
                .from('event-posters')
                .remove([fileName]);

            if (storageError) {
                console.warn("Could not delete image file, but continuing with data deletion:", storageError);
            }
        }

        // 3. Delete the row from the 'events' table
        console.log("Deleting event record...");
        const { error: dbError } = await _supabase
            .from('events')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;

        console.log("Deletion complete!");
        
        // 4. Refresh UI
        closeAllModals();
        load(); // Re-render the calendar

    } catch (err) {
        console.error("Deletion failed:", err);
        alert("Error deleting event: " + err.message);
    }
}

// --- 6. DATE JUMP ---
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

    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
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
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    document.getElementById('modalBackdrop').style.display = 'none';
}

document.getElementById('backButton').onclick = () => { nav--; load(); };
document.getElementById('nextButton').onclick = () => { nav++; load(); };

initJumpToDate();
load();