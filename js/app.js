// Global variables
let provider;
let signer;
let contract;
let userAccount = null;

// Wait for both DOM and ethers to load
window.addEventListener('load', function() {
    console.log('Window loaded, checking ethers...');
    console.log('ethers available:', typeof ethers);

    if (typeof ethers === 'undefined') {
        console.error('ethers.js not loaded properly');
        setTimeout(initApp, 1000); // Retry after 1 second
    } else {
        initApp();
    }
});

async function initApp() {
    console.log('DOM loaded, initializing app...');
    await initializeApp();
    setupEventListeners();
    populateZodiacSelect();
    console.log('App initialization complete');
}

// Initialize the application
async function initializeApp() {
    try {
        // Check if MetaMask is installed
        if (typeof window.ethereum !== 'undefined') {
            console.log('MetaMask is installed');

            // Check if already connected
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                await connectWallet();
            }
        } else {
            showError('MetaMask is required to use this application');
        }
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Connect wallet button
    const connectBtn = document.getElementById('connectWallet');
    if (connectBtn) {
        console.log('Adding click listener to connect button');
        connectBtn.addEventListener('click', function(e) {
            console.log('Connect button clicked');
            e.preventDefault();
            connectWallet();
        });
    } else {
        console.error('Connect wallet button not found');
    }

    // Create profile button
    const createBtn = document.getElementById('createProfileBtn');
    if (createBtn) {
        createBtn.addEventListener('click', createProfile);
    }

    // Update profile button
    const updateBtn = document.getElementById('updateProfileBtn');
    if (updateBtn) {
        updateBtn.addEventListener('click', updateProfile);
    }

    // Request match button
    const matchBtn = document.getElementById('requestMatchBtn');
    if (matchBtn) {
        matchBtn.addEventListener('click', requestMatch);
    }

    // Zodiac select change
    const zodiacSelect = document.getElementById('zodiacSelect');
    if (zodiacSelect) {
        zodiacSelect.addEventListener('change', onZodiacChange);
    }

    // Listen for account changes
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);
    }
}

// Connect wallet
async function connectWallet() {
    console.log('connectWallet function called');
    try {
        console.log('Checking for ethereum...', typeof window.ethereum);
        if (typeof window.ethereum === 'undefined') {
            console.error('MetaMask not found');
            alert('MetaMask is required to use this application');
            return;
        }

        console.log('Showing loading...');
        showLoading('Connecting to wallet...');

        // Request account access
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts',
        });

        // Check if we're on the correct network
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        if (parseInt(chainId, 16) !== CONFIG.CHAIN_ID) {
            await switchToSepoliaNetwork();
        }

        // Set up ethers
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, CONTRACT_ABI, signer);

        userAccount = accounts[0];

        // Update UI
        updateWalletUI();
        await loadUserData();

        hideLoading();
        showSuccess('Wallet connected successfully!');

    } catch (error) {
        hideLoading();
        console.error('Error connecting wallet:', error);
        showError('Failed to connect wallet: ' + error.message);
    }
}

// Switch to Sepolia network
async function switchToSepoliaNetwork() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x' + CONFIG.CHAIN_ID.toString(16) }],
        });
    } catch (switchError) {
        // This error code indicates that the chain has not been added to MetaMask
        if (switchError.code === 4902) {
            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [
                        {
                            chainId: '0x' + CONFIG.CHAIN_ID.toString(16),
                            chainName: 'Sepolia Test Network',
                            nativeCurrency: {
                                name: 'ETH',
                                symbol: 'ETH',
                                decimals: 18,
                            },
                            rpcUrls: [CONFIG.RPC_URL],
                            blockExplorerUrls: [CONFIG.EXPLORER_URL],
                        },
                    ],
                });
            } catch (addError) {
                throw new Error('Failed to add Sepolia network');
            }
        } else {
            throw switchError;
        }
    }
}

// Handle account changes
async function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        // User disconnected
        userAccount = null;
        provider = null;
        signer = null;
        contract = null;
        updateWalletUI();
    } else {
        userAccount = accounts[0];
        await connectWallet();
    }
}

// Handle chain changes
function handleChainChanged(chainId) {
    // Reload the page when chain changes
    window.location.reload();
}

// Update wallet UI
function updateWalletUI() {
    const connectBtn = document.getElementById('connectWallet');
    const walletStatus = document.getElementById('walletStatus');
    const walletAddress = document.getElementById('walletAddress');

    if (userAccount) {
        connectBtn.textContent = 'Connected';
        connectBtn.disabled = true;
        walletStatus.classList.remove('hidden');
        walletAddress.textContent = formatAddress(userAccount);
    } else {
        connectBtn.textContent = 'Connect Wallet';
        connectBtn.disabled = false;
        walletStatus.classList.add('hidden');
    }
}

// Load user data
async function loadUserData() {
    if (!contract || !userAccount) return;

    try {
        // Load profile status
        const profileStatus = await contract.getUserProfileStatus(userAccount);
        updateProfileUI(profileStatus.hasProfile);

        // Load user stats
        const userStats = await contract.getUserStats(userAccount);
        document.getElementById('userMatches').textContent = userStats.toString();

        // Load total matches
        const totalMatches = await contract.totalMatches();
        document.getElementById('totalMatches').textContent = totalMatches.toString();

    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Update profile UI
function updateProfileUI(hasProfile) {
    const profileStatus = document.getElementById('profileStatus');
    const createBtn = document.getElementById('createProfileBtn');
    const updateBtn = document.getElementById('updateProfileBtn');

    if (hasProfile) {
        profileStatus.textContent = 'Profile Created ✅';
        createBtn.style.display = 'none';
        updateBtn.style.display = 'inline-block';
    } else {
        profileStatus.textContent = 'No Profile';
        createBtn.style.display = 'inline-block';
        updateBtn.style.display = 'none';
    }
}

// Populate zodiac select
function populateZodiacSelect() {
    const select = document.getElementById('zodiacSelect');

    CONFIG.ZODIAC_SIGNS.forEach(zodiac => {
        const option = document.createElement('option');
        option.value = zodiac.id;
        option.textContent = zodiac.name;
        select.appendChild(option);
    });
}

// Handle zodiac selection change
function onZodiacChange() {
    const selectValue = document.getElementById('zodiacSelect').value;
    const zodiacInfo = document.getElementById('zodiacInfo');
    const createBtn = document.getElementById('createProfileBtn');

    if (selectValue) {
        const zodiac = CONFIG.ZODIAC_SIGNS[parseInt(selectValue)];

        document.getElementById('selectedZodiacName').textContent = zodiac.name;
        document.getElementById('selectedElement').textContent = CONFIG.ELEMENTS[zodiac.element];
        document.getElementById('selectedQuality').textContent = CONFIG.QUALITIES[zodiac.quality];

        zodiacInfo.style.display = 'block';
        createBtn.disabled = false;
    } else {
        zodiacInfo.style.display = 'none';
        createBtn.disabled = true;
    }
}

// Create profile
async function createProfile() {
    if (!contract || !userAccount) {
        showError('Please connect your wallet first');
        return;
    }

    const zodiacValue = document.getElementById('zodiacSelect').value;
    if (!zodiacValue) {
        showError('Please select your zodiac sign');
        return;
    }

    try {
        showLoading('Creating your private profile...');

        const zodiacId = parseInt(zodiacValue);
        const zodiac = CONFIG.ZODIAC_SIGNS[zodiacId];

        const tx = await contract.createProfile(zodiacId, zodiac.element, zodiac.quality);
        await tx.wait();

        hideLoading();
        showSuccess('Profile created successfully! Your zodiac information is now encrypted and private.');

        await loadUserData();

    } catch (error) {
        hideLoading();
        console.error('Error creating profile:', error);
        showError('Failed to create profile: ' + error.message);
    }
}

// Update profile
async function updateProfile() {
    if (!contract || !userAccount) {
        showError('Please connect your wallet first');
        return;
    }

    const zodiacValue = document.getElementById('zodiacSelect').value;
    if (!zodiacValue) {
        showError('Please select your zodiac sign');
        return;
    }

    try {
        showLoading('Updating your profile...');

        const zodiacId = parseInt(zodiacValue);
        const zodiac = CONFIG.ZODIAC_SIGNS[zodiacId];

        const tx = await contract.updateProfile(zodiacId, zodiac.element, zodiac.quality);
        await tx.wait();

        hideLoading();
        showSuccess('Profile updated successfully!');

    } catch (error) {
        hideLoading();
        console.error('Error updating profile:', error);
        showError('Failed to update profile: ' + error.message);
    }
}

// Request compatibility match
async function requestMatch() {
    if (!contract || !userAccount) {
        showError('Please connect your wallet first');
        return;
    }

    const partnerAddress = document.getElementById('partnerAddress').value;
    if (!partnerAddress) {
        showError('Please enter partner address');
        return;
    }

    if (!ethers.utils.isAddress(partnerAddress)) {
        showError('Please enter a valid Ethereum address');
        return;
    }

    if (partnerAddress.toLowerCase() === userAccount.toLowerCase()) {
        showError('You cannot match with yourself');
        return;
    }

    try {
        showLoading('Requesting compatibility match...');

        // Check if partner has a profile
        const partnerProfile = await contract.getUserProfileStatus(partnerAddress);
        if (!partnerProfile.hasProfile) {
            hideLoading();
            showError('Partner does not have a profile yet');
            return;
        }

        const tx = await contract.requestCompatibilityMatch(partnerAddress);
        await tx.wait();

        hideLoading();
        showSuccess('Compatibility match requested! The compatibility score is being calculated privately.');

        document.getElementById('partnerAddress').value = '';
        await loadUserMatches();

    } catch (error) {
        hideLoading();
        console.error('Error requesting match:', error);
        showError('Failed to request match: ' + error.message);
    }
}

// Load user matches
async function loadUserMatches() {
    // This would require additional contract functionality to get match IDs
    // For now, we'll show a placeholder
    const matchList = document.getElementById('matchList');
    matchList.innerHTML = '<p>Match results will be displayed here once the compatibility calculations are complete.</p>';
}

// Utility functions
function formatAddress(address) {
    return address.slice(0, 6) + '...' + address.slice(-4);
}

function scrollToSection(sectionId) {
    document.getElementById(sectionId).scrollIntoView({ behavior: 'smooth' });
}

function showLoading(message = 'Loading...') {
    console.log('showLoading called with:', message);
    const modal = document.getElementById('loadingModal');
    if (!modal) {
        console.error('Loading modal not found');
        alert(message);
        return;
    }
    const content = modal.querySelector('.modal-content p');
    if (content) {
        content.textContent = message;
    }
    modal.style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingModal').style.display = 'none';
}

function showSuccess(message) {
    showNotification(message, 'success');
}

function showError(message) {
    showNotification(message, 'error');
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">&times;</button>
    `;

    // Add to document
    document.body.appendChild(notification);

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Contract event listeners
function setupContractEventListeners() {
    if (!contract) return;

    // Listen for ProfileCreated events
    contract.on('ProfileCreated', (user) => {
        if (user.toLowerCase() === userAccount.toLowerCase()) {
            showSuccess('Profile created successfully!');
            loadUserData();
        }
    });

    // Listen for MatchRequested events
    contract.on('MatchRequested', (user1, user2, matchId) => {
        if (user1.toLowerCase() === userAccount.toLowerCase() ||
            user2.toLowerCase() === userAccount.toLowerCase()) {
            showSuccess('New compatibility match requested!');
            loadUserMatches();
        }
    });

    // Listen for CompatibilityRevealed events
    contract.on('CompatibilityRevealed', (matchId, score) => {
        showSuccess(`Compatibility score revealed: ${score}%`);
        loadUserMatches();
    });
}