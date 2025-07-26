// Ensure Supabase client is loaded from CDN first
if (typeof supabase === 'undefined' || !supabase.createClient) {
    console.error("Supabase client library not loaded from CDN. Aborting script execution.");
    document.body.innerHTML = '<h1 style="color:red;">Error: Supabase library failed to load. Please check the network connection and CDN link.</h1>';
} else {
    const supabaseUrl = 'https://qlhoipsilplgtfcpbrpr.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsaG9pcHNpbHBsZ3RmY3BicnByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExNzg0NzMsImV4cCI6MjA1Njc1NDQ3M30.e4UlDKIAJ4SAPuOwgPFoZQNiVlD7JZIgn73yQVAX6LE';
    const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
    let currentMenuItems = []; // Holds the current menu items fetched from DB
    let currentCategories = []; // Holds the current categories fetched from DB
    let ownerUserId = null; // Holds the ID of the owner whose menu is being displayed

    // Centralized error handling
    function handleError(error, message) {
        console.error(`${message}:`, error);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = `Error: ${message}. ${error.message || ''}. Check console.`;
        const existingError = document.querySelector('.error-message');
        if (!existingError) {
            document.body.prepend(errorDiv);
            setTimeout(() => errorDiv.remove(), 5000);
        }
        return [];
    }

    // Toast notification (optional for share page, but can be useful for errors)
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // Helper function to get public URL for an image path in a specific bucket
    function getImagePublicUrl(bucketName, filePath) {
        if (!filePath) {
            // Return a generic placeholder or handle differently if needed
            return 'placeholder.png';
        }
        if (!bucketName) {
            console.error("Bucket name is required for getImagePublicUrl");
            return 'placeholder.png'; // Or throw an error
        }
        // Construct the public URL for the image in Supabase Storage
        const supabaseStorageUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/`;
        return `${supabaseStorageUrl}${filePath}`;
    }

    // --- Data Fetching Functions (Modified for Owner ID) ---
    async function getCategories(userId) {
        if (!userId) return handleError(new Error("Owner User ID is missing"), "Cannot load categories");
        console.log(`Fetching categories for user: ${userId}...`);
        const { data, error } = await supabaseClient
            .from('categories')
            .select('*')
            .eq('user_id', userId) // Filter by provided user ID
            .order('name', { ascending: true });

        if (error) return handleError(error, 'Failed to load categories');

        console.log("Categories fetched:", data);
        return data || [];
    }

    async function getMenuItems(userId) {
        if (!userId) return handleError(new Error("Owner User ID is missing"), "Cannot load menu items");
        console.log(`Fetching menu items for user: ${userId}...`);
        const { data, error } = await supabaseClient
            .from('menu_items')
            .select('*')
            .eq('user_id', userId); // Filter by provided user ID

        if (error) return handleError(error, `Failed to load menu items (DB Error: ${error.message})`);

        console.log("Menu items fetched:", data);
        return data || [];
    }

    // Fetch restaurant profile data (name, logo)
    async function getRestaurantProfile(userId) {
        if (!userId) {
            console.error("User ID is required to fetch restaurant profile.");
            return null;
        }
        console.log("Fetching restaurant profile for user:", userId);
        try {
            const { data, error, status } = await supabaseClient
                .from('profiles') // Assuming a 'profiles' table
                .select('restaurant_name, logo_url, phone_number, area, background_color, item_color, item_name_color, item_price_color') // Select the relevant columns including colors
                .eq('id', userId) // Filter by the user's ID
                .single(); // Expect only one profile per user

            if (error && status !== 406) { // 406 means no rows found, which is handled below
                throw error;
            }

            if (data) {
                console.log("Restaurant profile fetched:", data);
                return data;
            } else {
                console.warn("No restaurant profile found for user:", userId);
                return null; // No profile found for this user
            }
        } catch (error) {
            return handleError(error, 'Failed to load restaurant profile');
        }
    }

    // --- DOM Manipulation Functions (Simplified for Display Only) ---
    function createMenuItemCard(item, profileColors = {}) {
        const card = document.createElement('div');
        card.className = 'menu-item'; // No 'editing' class needed
        card.dataset.itemId = item.id;
        // Use updated helper with bucket name 'menu-item-images'
        const imageUrl = getImagePublicUrl('menu-item-images', item.image);

        const itemNameStyle = profileColors.item_name_color ? `style="color: ${profileColors.item_name_color};"` : '';
        const itemPriceStyle = profileColors.item_price_color ? `style="color: ${profileColors.item_price_color};"` : '';

        card.innerHTML = `
            <img src="${imageUrl}" alt="${item.name}" class="item-image" onerror="this.onerror=null;this.src='placeholder.png';">
            <div class="item-content">
                <h3 class="item-name" ${itemNameStyle}>${item.name || 'Unnamed Item'}</h3>
                <div class="item-header">
                    <span class="item-price" ${itemPriceStyle}>${item.price ? '$' + parseFloat(item.price).toFixed(2) : 'N/A'}</span>
                </div>
                <p class="item-description">${item.description || 'No description available.'}</p>
                <div class="expand-indicator">
                    <i class="fas fa-chevron-down"></i>
                </div>
            </div>
           `;

        // Add click listener for expanding description
        card.addEventListener('click', (e) => {
            const descriptionElement = card.querySelector('.item-description');
            if (descriptionElement) {
                descriptionElement.classList.toggle('visible');
            }
            const indicator = card.querySelector('.expand-indicator i');
            if (indicator) {
                indicator.classList.toggle('fa-chevron-down');
                indicator.classList.toggle('fa-chevron-up');
            }
        });
        return card;
    }

    function filterMenuItems(category, menuItems, menuGrid, profileColors = {}) {
        if (!menuGrid) {
            console.error("Menu grid not found!");
            return;
        }
        menuGrid.innerHTML = '';
        const filteredItems = category === 'All'
            ? menuItems
            : menuItems.filter(item => item.category?.toLowerCase() === category.toLowerCase());

        console.log(`Filtering for category: ${category}, Items found: ${filteredItems.length}`);

        if (filteredItems.length === 0) {
            menuGrid.innerHTML = '<p>No items found in this category.</p>';
        } else {
            filteredItems.forEach(item => {
                menuGrid.appendChild(createMenuItemCard(item, profileColors));
            });
        }
    }

    function addCategoriesToNav(categories, menuItems, menuGrid, profileColors = {}) {
        const categoryScroll = document.querySelector('.category-nav .category-scroll');
        if (!categoryScroll) {
            console.error("Category scroll container not found!");
            return;
        }
        categoryScroll.innerHTML = ''; // Clear existing buttons

        // Add 'All' button
        const allButton = document.createElement('button');
        allButton.className = 'category-btn active';
        allButton.textContent = 'All';
        allButton.onclick = () => {
            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
            allButton.classList.add('active');
            filterMenuItems('All', menuItems, menuGrid, profileColors);
        };
        categoryScroll.appendChild(allButton);

        // Add buttons for each category
        categories.forEach(category => {
            const categoryButton = document.createElement('button');
            categoryButton.className = 'category-btn';
            categoryButton.textContent = category.name;
            categoryButton.onclick = () => {
                document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
                categoryButton.classList.add('active');
                filterMenuItems(category.name, menuItems, menuGrid, profileColors);
            };
            categoryScroll.appendChild(categoryButton);
        });
    }

    // --- Initialization ---
    document.addEventListener('DOMContentLoaded', async () => {
        const menuGrid = document.querySelector('.menu-grid');
        const restaurantNameElement = document.getElementById('shared-restaurant-name');
        const restaurantLogoElement = document.getElementById('shared-restaurant-logo');

        if (!menuGrid || !restaurantNameElement || !restaurantLogoElement) {
            console.error("Menu grid element not found on page load.");
            handleError(new Error("Required element '.menu-grid' missing."), "Page setup failed");
            return;
        }

        // Get owner ID from URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        ownerUserId = urlParams.get('user'); // Corrected parameter name to 'user'

        if (!ownerUserId) {
            console.error("Owner ID not found in URL (?owner=...). Cannot load menu.");
            menuGrid.innerHTML = '<p class="error-message">Error: No restaurant specified. Please ensure the link includes the owner ID.</p>';
            // Optionally hide category nav if no owner
            const categoryNav = document.querySelector('.category-nav');
            if(categoryNav) categoryNav.style.display = 'none';
            return;
        }

        console.log(`Loading menu for owner: ${ownerUserId}`);

        // Fetch and display restaurant profile info
        const profileData = await getRestaurantProfile(ownerUserId);
        if (profileData) {
            restaurantNameElement.textContent = profileData.restaurant_name || 'Restaurant Menu';
            if (profileData.logo_url) {
                // Use updated helper with bucket name 'profile-logos'
            }

            // Apply fetched colors
            if (profileData.background_color) {
                document.body.style.backgroundColor = profileData.background_color;
            }
            if (profileData.item_color) {
                // Need to wait for menu items to be rendered before applying item color
                // This will be handled after fetching menu items
            }

            if (profileData.logo_url) {
                restaurantLogoElement.src = getImagePublicUrl('profile-logos', profileData.logo_url);
                restaurantLogoElement.alt = `${profileData.restaurant_name || 'Restaurant'} Logo`;
            } else {
                 restaurantLogoElement.alt = 'Restaurant Logo'; // Keep placeholder image src
            }
            const phoneNumberElement = document.getElementById('shared-restaurant-phone-number');
            const areaElement = document.getElementById('shared-restaurant-area');

            if (phoneNumberElement) {
                phoneNumberElement.textContent = profileData.phone_number || '';
                console.log("Updated shared phone number to:", phoneNumberElement.textContent);
            } else {
                console.error("Shared phone number element not found.");
            }

            if (areaElement) {
                areaElement.textContent = profileData.area || '';
                console.log("Updated shared area to:", areaElement.textContent);
            } else {
                console.error("Shared area element not found.");
            }
        } else {
            restaurantNameElement.textContent = 'Restaurant Menu'; // Default name if profile fails
             restaurantLogoElement.alt = 'Restaurant Logo'; // Keep placeholder image src
        }

        // Fetch data for the specific owner
        currentCategories = await getCategories(ownerUserId);
        currentMenuItems = await getMenuItems(ownerUserId);

        // Populate the page
        addCategoriesToNav(currentCategories, currentMenuItems, menuGrid, profileData);
        filterMenuItems('All', currentMenuItems, menuGrid, profileData); // Display 'All' items initially

        // Apply item color after menu items are rendered
        if (profileData && profileData.item_color) {
            document.querySelectorAll('.menu-item').forEach(item => {
                item.style.backgroundColor = profileData.item_color;
            });
        }
    });
}