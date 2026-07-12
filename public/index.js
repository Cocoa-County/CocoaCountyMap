const defaultAppTitle = 'Contra Costa Elections Map';
const defaultIntroSubtitle = 'Interactive Election Results';
const defaultIntroDescription = 'This interactive map displays precinct-level voting results using your configured election data repository.';
let pageTitle = defaultAppTitle;
let precinctIDField = 'PrecinctID';
let precinctLabelField = 'PrecinctNM';
let grouped = false;
const additionalGISData = false;
const electionsIndexFiles = [
    'https://cocoa-county.github.io/ElectionOpenDataRepository/elections.index.json',
];
const defaultMapView = {
    center: [39.8283, -98.5795],
    zoom: 4
};

// Intro overlay handler
const introOverlay = document.getElementById('intro-overlay');
const introMain = document.getElementById('intro-main');
const introLoading = document.getElementById('intro-loading');
const introLoadingText = document.getElementById('intro-loading-text');
const introTitle = document.getElementById('intro-title');
const introSubtitle = document.getElementById('intro-subtitle');
const introDescription = document.getElementById('intro-description');
const introSnapshotInfo = document.getElementById('intro-snapshot-info');
const closeIntroBtn = document.getElementById('close-intro');
const startTourBtn = document.getElementById('start-tour');
const introAdvancedAction = document.getElementById('intro-advanced-action');
const openElectionBrowserBtn = document.getElementById('open-election-browser');
const electionBrowserOverlay = document.getElementById('election-browser-overlay');
const closeElectionBrowserBtn = document.getElementById('close-election-browser');
const loadElectionDatasetBtn = document.getElementById('load-election-dataset');
const electionBrowserTitle = document.getElementById('election-browser-title');
const electionBrowserList = document.getElementById('election-browser-list');
const electionBrowserStatus = document.getElementById('election-browser-status');
const shareOverlay = document.getElementById('share-overlay');
const closeShareBtn = document.getElementById('close-share');
const copyShareLinkBtn = document.getElementById('copy-share-link');
const shareLinkPreview = document.getElementById('share-link-preview');
const shareCopyStatus = document.getElementById('share-copy-status');
const shareDatasourceInput = document.getElementById('share-datasource-input');
const shareToggleIds = {
    contest: 'share-include-contest',
    view: 'share-include-view',
    vision: 'share-include-vision',
    opacity: 'share-include-opacity',
    advanced: 'share-include-advanced',
    datasource: 'share-include-datasource'
};
const queryParams = {
    election: 'election',
    datasource: 'datasource',
    advanced: 'advanced',
    contest: 'contest',
    view: 'view',
    vision: 'vision',
    opacity: 'opacity'
};
const hierarchySeparator = '~';
const supportedVisionModes = new Set(['normal', 'highContrast', 'colorblind']);

let electionsIndex = null;
let electionsIndexSourceUrl = null;
let electionRecordsById = new Map();
let contests = [];
let data = { contests: [] };
let precinctsLayer = null;
let isElectionLoadInProgress = false;
let activeSnapshotId = null;
let activeGeographyId = null;
let pendingSnapshotId = null;
let electionLoadToken = 0;
const expandedElectionGroups = new Set();
let hasAutoExpandedActiveGroup = false;
const snapshotModeWarnings = new Set();
let shareCopyStatusTimeout = null;

window.availableElections = [];

function sanitizeAnalyticsParams(params = {}) {
    let cleanParams = {};

    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        if (typeof value === 'number' && !Number.isFinite(value)) return;
        cleanParams[key] = value;
    });

    return cleanParams;
}

function getActiveSnapshot() {
    if (!activeSnapshotId || !Array.isArray(window.availableElections)) return null;
    return window.availableElections.find(snapshot => snapshot.id === activeSnapshotId || snapshot.snapshotId === activeSnapshotId) || null;
}

function trackMapEvent(eventName, params = {}) {
    if (typeof window.gtag !== 'function') return;

    const activeSnapshot = getActiveSnapshot();
    const eventParams = sanitizeAnalyticsParams({
        page_title: document.title,
        page_path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        snapshot_id: activeSnapshot?.id || activeSnapshot?.snapshotId,
        election_group_id: activeSnapshot?.electionGroupId,
        ...params
    });

    window.gtag('event', eventName, eventParams);
}

window.trackMapEvent = trackMapEvent;

setIntroLoadingState(true, 'Loading election data...');

if (closeIntroBtn) {
    closeIntroBtn.addEventListener('click', () => {
        introOverlay.classList.add('hidden');
    });
}

if (startTourBtn) {
    startTourBtn.addEventListener('click', () => {
        introOverlay.classList.add('hidden');
        startTour();
    });
}

if (openElectionBrowserBtn) {
    openElectionBrowserBtn.addEventListener('click', () => {
        openElectionBrowser();
    });
}

if (closeElectionBrowserBtn) {
    closeElectionBrowserBtn.addEventListener('click', () => {
        closeElectionBrowser();
    });
}

if (closeShareBtn) {
    closeShareBtn.addEventListener('click', () => {
        closeShareModal();
    });
}

if (copyShareLinkBtn) {
    copyShareLinkBtn.addEventListener('click', async () => {
        await copyShareLinkToClipboard();
    });
}

if (loadElectionDatasetBtn) {
    loadElectionDatasetBtn.addEventListener('click', async () => {
        const pendingSnapshot = getPendingSnapshot();
        if (!pendingSnapshot || !isLoadableSnapshot(pendingSnapshot)) return;
        if (pendingSnapshot.id === activeSnapshotId || isElectionLoadInProgress) return;

        await loadElectionDataset(pendingSnapshot, { updateUrl: true, closeBrowserOnSuccess: true });
    });
}

if (electionBrowserOverlay) {
    electionBrowserOverlay.addEventListener('click', event => {
        if (event.target === electionBrowserOverlay) closeElectionBrowser();
    });
}

if (shareOverlay) {
    shareOverlay.addEventListener('click', event => {
        if (event.target === shareOverlay) closeShareModal();
    });
}

if (shareDatasourceInput) {
    shareDatasourceInput.addEventListener('input', () => {
        const datasourceToggle = getShareToggle('datasource');
        if (datasourceToggle) {
            const typedValue = shareDatasourceInput.value.trim();
            const usingDefaultDataSource = !typedValue || isDefaultDataSourceValue(typedValue);
            datasourceToggle.disabled = usingDefaultDataSource;
            datasourceToggle.checked = !usingDefaultDataSource && !!typedValue;
        }
        updateShareLinkPreview();
    });
}

Object.values(shareToggleIds).forEach(toggleId => {
    const input = document.getElementById(toggleId);
    if (!input) return;
    input.addEventListener('change', () => {
        syncShareToggleDependencies();
        updateShareLinkPreview();
    });
});

document.querySelectorAll('input[name="colorblind-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        applyColorblindMode(e.target.value);
    });
});

applyAdvancedModeUiVisibilityFromQuery();

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && electionBrowserOverlay && !electionBrowserOverlay.classList.contains('hidden')) {
        closeElectionBrowser();
    }
    if (event.key === 'Escape' && shareOverlay && !shareOverlay.classList.contains('hidden')) {
        closeShareModal();
    }
});

window.openShareModal = openShareModal;

// Tour functionality
const baseTourSteps = [
    {
        title: 'Welcome to the Interactive Map',
        description: 'Click on any precinct to see detailed voting results, turnout information, and registered voter counts.',
        target: null,
        position: 'center'
    },
    {
        title: 'Control Panel',
        description: 'Hover over or click this panel to access map controls. It will expand to show all available options.',
        target: '[data-tour-target="control-panel"]',
        position: 'right'
    },
    {
        title: 'Pin Map Controls',
        description: 'Use the pin button to keep Map Controls open. Click it again to return to normal auto-close behavior.',
        target: '[data-tour-target="control-pin"]',
        position: 'right'
    },
    {
        title: 'Select a Layer',
        description: 'Use this selector to switch between available map layers when the active dataset includes multiple geographies.',
        target: '[data-tour-target="layer-selector"]',
        position: 'right',
        optional: true
    },
    {
        title: 'Select a Contest',
        description: 'Use this dropdown to switch between available contest views for the active dataset.',
        target: '[data-tour-target="contest-selector"]',
        position: 'right'
    },
    {
        title: 'Choose a View',
        description: 'Select how to display results: Winner by Precinct, Contest Turnout, or individual candidate vote percentages.',
        target: '[data-tour-target="choice-selector"]',
        position: 'right'
    },
    {
        title: 'Adjust Opacity',
        description: 'Use this slider to adjust the map overlay transparency, making it easier to see underlying geographic features.',
        target: '[data-tour-target="opacity-slider"]',
        position: 'right'
    },
    {
        title: 'Vision Mode',
        description: 'Use this selector to adjust map colors for accessibility, including High Contrast and Colorblind-Safe modes.',
        target: '[data-tour-target="vision-mode-selector"]',
        position: 'right'
    },
    {
        title: 'Legend Panel',
        description: 'Use this button to open the Legend panel and see the meaning of map colors for the current view.',
        target: '[data-tour-target="legend-panel"]',
        position: 'right'
    },
    {
        title: 'Pin Legend',
        description: 'Use the Legend pin button to keep the panel open while exploring the map.',
        target: '[data-tour-target="legend-pin"]',
        position: 'right'
    }
];

let currentTourStep = 0;
let tourStepRenderToken = 0;
let activeTourSteps = [];
const tourOverlay = document.getElementById('tour-overlay');
const tourSpotlight = document.getElementById('tour-spotlight');
const tourContent = document.getElementById('tour-content');
const tourTitle = document.getElementById('tour-title');
const tourDescription = document.getElementById('tour-description');
const tourProgress = document.getElementById('tour-progress');
const tourPrevBtn = document.getElementById('tour-prev');
const tourNextBtn = document.getElementById('tour-next');
const tourSkipBtn = document.getElementById('tour-skip');

function getActiveTourSteps() {
    return baseTourSteps.filter(step => {
        if (!step.optional || !step.target) return true;
        return !!document.querySelector(step.target);
    });
}

function startTour() {
    activeTourSteps = getActiveTourSteps();
    currentTourStep = 0;
    window.tourActive = true;
    tourOverlay.classList.remove('hidden');
    showTourStep(currentTourStep);
}

function endTour() {
    tourStepRenderToken++;
    window.tourActive = false;
    tourOverlay.classList.add('hidden');
    currentTourStep = 0;
    tourSpotlight.style.display = 'none';

    // Close the control panel
    if (window.selector && typeof window.selector._close === 'function') {
        window.selector._close(true);
    }
    if (window.legend && typeof window.legend._close === 'function') {
        window.legend._close(true);
    }
}

function positionTourContent(stepIndex) {
    tourContent.style.left = '50%';
    tourContent.style.right = 'auto';

    if (stepIndex === 0) {
        tourContent.style.top = 'auto';
        tourContent.style.bottom = '20px';
        tourContent.style.transform = 'translateX(-50%)';
        return;
    }

    tourContent.style.top = '20px';
    tourContent.style.bottom = 'auto';
    tourContent.style.transform = 'translateX(-50%)';
}

function openTourTargetPanel(targetElement) {
    const controlPanel = targetElement.closest('.election-selector, .legend-control');
    if (!controlPanel || !controlPanel.classList.contains('closed')) return;

    if (controlPanel.classList.contains('election-selector') && window.selector && typeof window.selector._open === 'function') {
        window.selector._open();
        return;
    }

    if (controlPanel.classList.contains('legend-control') && window.legend && typeof window.legend._open === 'function') {
        window.legend._open();
        return;
    }

    controlPanel.classList.remove('closed');
}

function showTourStep(stepIndex) {
    const step = activeTourSteps[stepIndex];
    if (!step) return;
    const renderToken = ++tourStepRenderToken;
    trackMapEvent('tour_step_view', {
        step_index: stepIndex,
        step_number: stepIndex + 1,
        step_title: step?.title || null,
        step_target: step?.target || 'none',
        total_steps: activeTourSteps.length
    });

    tourTitle.textContent = step.title;
    tourDescription.textContent = step.description;
    tourProgress.textContent = `${stepIndex + 1} / ${activeTourSteps.length}`;

    tourPrevBtn.disabled = stepIndex === 0;
    tourNextBtn.textContent = stepIndex === activeTourSteps.length - 1 ? 'Finish' : 'Next';
    positionTourContent(stepIndex);

    if (!step.target) {
        tourSpotlight.style.display = 'none';
        return;
    }

    const targetElement = document.querySelector(step.target);
    if (!targetElement) {
        console.warn(`Tour target not found for step ${stepIndex + 1}: ${step.target}`);
        tourSpotlight.style.display = 'none';
        return;
    }

    openTourTargetPanel(targetElement);

    requestAnimationFrame(() => {
        if (renderToken !== tourStepRenderToken || !window.tourActive) return;

        const rect = targetElement.getBoundingClientRect();
        if (!rect.width || !rect.height) {
            tourSpotlight.style.display = 'none';
            return;
        }

        const pinTargetOffset = targetElement.classList.contains('map-panel-pin-btn') ? 4 : 0;
        tourSpotlight.style.top = `${rect.top - 5 - pinTargetOffset}px`;
        tourSpotlight.style.left = `${rect.left - 5}px`;
        tourSpotlight.style.width = `${rect.width + 10}px`;
        tourSpotlight.style.height = `${rect.height + 10}px`;
        tourSpotlight.style.display = 'block';
    });
}

if (tourPrevBtn) {
    tourPrevBtn.addEventListener('click', () => {
        if (currentTourStep > 0) {
            currentTourStep--;
            showTourStep(currentTourStep);
        }
    });
}

if (tourNextBtn) {
    tourNextBtn.addEventListener('click', () => {
        if (currentTourStep < activeTourSteps.length - 1) {
            currentTourStep++;
            showTourStep(currentTourStep);
        } else {
            trackMapEvent('tour_complete', {
                completed_steps: activeTourSteps.length,
                total_steps: activeTourSteps.length
            });
            endTour();
        }
    });
}

if (tourSkipBtn) {
    tourSkipBtn.addEventListener('click', () => {
        const step = activeTourSteps[currentTourStep];
        trackMapEvent('tour_exit_early', {
            step_index: currentTourStep,
            step_number: currentTourStep + 1,
            step_title: step?.title || null,
            steps_remaining: Math.max(0, activeTourSteps.length - (currentTourStep + 1)),
            total_steps: activeTourSteps.length
        });
        endTour();
    });
}

const map = L.map('map', { preferCanvas: false });

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

(async () => {
    const queryDataSource = getDataSourceFromQuery();
    const queryDataSourceIndexUrl = normalizeDataSourceIndexUrl(queryDataSource);
    const startupIndexFiles = queryDataSourceIndexUrl ? [queryDataSourceIndexUrl] : electionsIndexFiles;

    try {
        setIntroLoadingState(true, 'Loading election index...');
        const loadedIndex = await loadIndexWithFallback(startupIndexFiles);
        electionsIndex = loadedIndex?.data || null;
        electionsIndexSourceUrl = loadedIndex?.sourceUrl || null;
        electionRecordsById = buildElectionRecordMap(electionsIndex);
        window.availableElections = getSnapshotDatasets(electionsIndex);

        renderElectionBrowserList();

        const selectedSnapshot = getSelectedElection(
            window.availableElections,
            electionsIndex?.defaultElectionId,
            getElectionIdFromQuery(),
            getSnapshotIdFromQuery()
        );
        if (selectedSnapshot) {
            pendingSnapshotId = selectedSnapshot.id;
            await loadElectionDataset(selectedSnapshot, {
                selectedGeographyId: getLayerIdFromQuery(),
                selectorStateOverride: getSelectorStateFromQuery(),
                updateUrl: true,
                closeBrowserOnSuccess: false
            });
        } else {
            applyActiveElectionTitle(null);
            setElectionBrowserStatus('No loadable election datasets were found in the configured index.');
            buildPrecinctLayer({ type: 'FeatureCollection', features: [] });
            buildElectionSelector();
        }
    } catch (error) {
        console.error('Election data load failed:', error);
        applyActiveElectionTitle(null);
        if (queryDataSource) {
            setElectionBrowserStatus('Unable to load election index from the datasource query parameter. Check the datasource value and try again.');
        } else {
            setElectionBrowserStatus('Unable to load election index. Check your configured index URL and try again.');
        }
        buildPrecinctLayer({ type: 'FeatureCollection', features: [] });
        buildElectionSelector();
    }

    setIntroLoadingState(false);
    applyDefaultMapView();
})();

window.addEventListener('popstate', async () => {
    applyAdvancedModeUiVisibilityFromQuery();

    if (!window.availableElections?.length || isElectionLoadInProgress) return;

    const requestedLayerId = getLayerIdFromQuery();
    const selectorStateOverride = getSelectorStateFromQuery();
    const selectedSnapshot = getSelectedElection(
        window.availableElections,
        electionsIndex?.defaultElectionId,
        getElectionIdFromQuery(),
        getSnapshotIdFromQuery()
    );
    if (!selectedSnapshot) return;

    const selectedGeography = getSelectedGeography(selectedSnapshot, requestedLayerId);
    if (selectedSnapshot.id === activeSnapshotId && idsEqual(selectedGeography?.id, activeGeographyId)) {
        buildElectionSelector(selectedSnapshot, getSnapshotGeographies(selectedSnapshot), selectedGeography, selectorStateOverride);
        return;
    }

    await loadElectionDataset(selectedSnapshot, {
        selectedGeographyId: requestedLayerId,
        selectorStateOverride,
        updateUrl: false,
        closeBrowserOnSuccess: false
    });
});

async function loadElectionDataset(snapshot, options = {}) {
    const {
        selectedGeographyId = null,
        selectorStateOverride = null,
        updateUrl = true,
        closeBrowserOnSuccess = true
    } = options;

    if (!snapshot || !electionsIndexSourceUrl) return;
    if (isElectionLoadInProgress) return;

    const availableGeographies = getSnapshotGeographies(snapshot);
    const selectedGeography = getSelectedGeography(snapshot, selectedGeographyId || activeGeographyId);
    const electionDataFile = resolveIndexPath(selectedGeography?.dataUrl, electionsIndexSourceUrl);
    const precinctsFile = resolveIndexPath(selectedGeography?.precinctsUrl, electionsIndexSourceUrl);

    if (!electionDataFile || !precinctsFile) {
        setElectionBrowserStatus('Selected dataset is missing required file URLs.');
        return;
    }

    isElectionLoadInProgress = true;
    setIntroLoadingState(true, 'Loading election dataset...');
    const token = ++electionLoadToken;
    setElectionBrowserStatus('Loading dataset...');
    map.closePopup();

    try {
        const [nextData, nextPrecincts, addData] = await Promise.all([
            loadJson(electionDataFile),
            loadJson(precinctsFile),
            additionalGISData ? loadJson('data/add.gis.json') : Promise.resolve(null)
        ]);

        if (token !== electionLoadToken) return;

        data = normalizeElectionDataShape(nextData);
        contests = Array.isArray(data?.contests) ? data.contests : [];
        precinctIDField = selectedGeography?.precinctIdField
            || selectedGeography?.areaIdField
            || snapshot.precinctIdField
            || snapshot.areaIdField
            || precinctIDField;
        precinctLabelField = selectedGeography?.precinctLabelField
            || selectedGeography?.areaLabelField
            || snapshot.precinctLabelField
            || snapshot.areaLabelField
            || precinctLabelField;
        grouped = selectedGeography?.grouped ?? snapshot.grouped ?? grouped;
        activeSnapshotId = snapshot.id || null;
        activeGeographyId = selectedGeography?.id || null;
        pendingSnapshotId = activeSnapshotId;
        applyActiveElectionTitle(snapshot);

        buildPrecinctLayer(nextPrecincts || { type: 'FeatureCollection', features: [] }, addData);
        buildElectionSelector(snapshot, availableGeographies, selectedGeography, selectorStateOverride);
        renderElectionBrowserList();

        if (updateUrl) setSelectionQueryParams(snapshot);
        if (closeBrowserOnSuccess) closeElectionBrowser();

        applyDefaultMapView();
        setElectionBrowserStatus('');
    } catch (error) {
        if (token !== electionLoadToken) return;
        console.error('Election dataset load failed:', error);
        setElectionBrowserStatus('Failed to load selected dataset. Please try another election.');
    } finally {
        if (token === electionLoadToken) {
            isElectionLoadInProgress = false;
            setIntroLoadingState(false);
            renderElectionBrowserList();
        }
    }
}

function setIntroLoadingState(isLoading, message = 'Loading election data...') {
    if (!introMain || !introLoading) return;

    introMain.hidden = isLoading;
    introLoading.hidden = !isLoading;

    if (introLoadingText) {
        introLoadingText.textContent = message;
    }

    if (isLoading && closeIntroBtn) {
        closeIntroBtn.disabled = true;
    }

    if (!isLoading && closeIntroBtn) {
        closeIntroBtn.disabled = false;
    }
}

function buildPrecinctLayer(precincts, addData) {
    if (precinctsLayer) {
        map.removeLayer(precinctsLayer);
        precinctsLayer = null;
    }

    precinctsLayer = L.geoJSON(precincts, {
        style: () => {
            return {
                fillOpacity: 1,
                weight: 1,
                color: '#AAAAAA'
            };
        },
        onEachFeature: (feature, layer) => {
            if (addData) {
                let addProps = addData.data[feature.properties[addData.key]];
                if (addProps) Object.assign(feature.properties, addProps);
            }

            layer.on({
                click: e => {
                    if (!window.selector || !contests.length) {
                        let label = e.target.feature.properties[precinctLabelField] || 'Precinct';
                        L.popup()
                            .setLatLng(e.latlng)
                            .setContent(`<p class="popup-title">${label}<br/></p>No election data loaded.`)
                            .openOn(map);
                        return;
                    }

                    let contest = contests[window.selector.selection.contest];
                    let choice = contest.choices[window.selector.selection.choice];
                    let precinct = contest.precincts[e.target.feature.properties[precinctIDField]];

                    if (grouped) precinctsLayer.eachLayer(featureLayer => {
                        if (featureLayer.feature.properties[precinctIDField] == e.target.feature.properties[precinctIDField]) featureLayer.setStyle({
                            weight: 2,
                            color: getBorderColor(e.target.options)
                        }).bringToFront();
                    });

                    e.target.setStyle({
                        weight: 2,
                        color: getBorderColor(e.target.options)
                    }).bringToFront();

                    let content = '';

                    let precinctId = e.target.feature.properties[precinctIDField] || 'Unknown Precinct';
                    let precinctLabel = e.target.feature.properties[precinctLabelField] || precinctId;
                    if (grouped) content += `<p class="popup-title">${precinctId} → ${precinctLabel}<br/></p>`;
                    else content += `<p class="popup-title">${precinctLabel}<br/></p>`;

                    if (!precinct) content += 'No Election Results';
                    else {
                        if (precinct.registeredVoters == 0 && (precinct.total === undefined || precinct.total == 0)) content += 'No Registered Voters<br/>';
                        else {
                            if (precinct.total === undefined) {
                                content += 'No Contest Results<br/>';
                            } else if (precinct.total == 0) {
                                content += 'No Votes<br/>';
                            } else if (window.selector.selection.choice === 't') {
                                content += `Total Votes: ${precinct.total}<br/>`;
                            } else if (!precinct.results) {
                                content += `Hidden for Privacy<br/>Total Votes: ${precinct.total}<br/>`;
                            } else if (window.selector.selection.choice === 'w') {
                                let winningChoiceIndices = normalizeWinnerIndices(precinct.winner);
                                if (!winningChoiceIndices.length) {
                                    content += `<p class="popup-subtitle">Winner unavailable</p>`;
                                } else if (winningChoiceIndices.length === 1) {
                                    let winningChoiceIndex = winningChoiceIndices[0];
                                    let winningChoice = contest.choices[winningChoiceIndex];
                                    let winningLabel = winningChoice ? winningChoice.label : 'Winner unavailable';
                                    content += `
                                    <p class="popup-subtitle">${winningLabel}</p>
                                    Votes: ${precinct.results[winningChoiceIndex]}/${precinct.total} (${precinct.percentage ? (100 * precinct.percentage[winningChoiceIndex]).toFixed(0) : 0}%)<br/>
                                    `;
                                } else {
                                    content += `<p class="popup-subtitle">Tie</p>Tied winners:<br/>`;
                                    winningChoiceIndices.forEach(winningChoiceIndex => {
                                        let winningChoice = contest.choices[winningChoiceIndex];
                                        let winningLabel = winningChoice ? winningChoice.label : 'Winner unavailable';
                                        content += `
                                        <p class="popup-subtitle">${winningLabel}</p>
                                        Votes: ${precinct.results[winningChoiceIndex]}/${precinct.total} (${precinct.percentage ? (100 * precinct.percentage[winningChoiceIndex]).toFixed(0) : 0}%)<br/>
                                        `;
                                    });
                                }
                            } else {
                                let selectedChoice = choice || {};
                                content += `
                                <p class="popup-subtitle">${selectedChoice.label || 'Choice unavailable'}</p>
                                Votes: ${precinct.results[window.selector.selection.choice]}/${precinct.total} (${precinct.percentage ? (100 * precinct.percentage[window.selector.selection.choice]).toFixed(0) : 0}%)<br/>
                                `;
                            }

                            content += `Registered Voters: ${precinct.registeredVoters || 0}<br/>`;

                            if (precinct.total !== undefined && precinct.total == precinct.totalVoters && precinct.registeredVoters > 0) {
                                content += `Turnout: ${(100 * precinct.total / precinct.registeredVoters).toFixed(0)}%<br/>`;
                            } else {
                                if (precinct.total !== undefined && precinct.registeredVoters > 0) {
                                    if (contest.voteFor > 1) {
                                        content += `Contest Type: Vote For ${contest.voteFor}<br/>`;
                                        content += `Contest Turnout: ${precinct.total}/${precinct.registeredVoters * contest.voteFor} (${(100 * precinct.total / precinct.registeredVoters / contest.voteFor).toFixed(0)}%)<br/>`;
                                    } else {
                                        content += `Contest Turnout: ${precinct.total}/${precinct.registeredVoters} (${(100 * precinct.total / precinct.registeredVoters).toFixed(0)}%)<br/>`;
                                    }
                                }
                                if (precinct.totalVoters !== undefined && precinct.registeredVoters > 0) {
                                    content += `Ballot Turnout: ${precinct.totalVoters}/${precinct.registeredVoters} (${(100 * precinct.totalVoters / precinct.registeredVoters).toFixed(0)}%)<br/>`;
                                }
                            }
                        }
                    }

                    L.popup()
                        .setLatLng(e.latlng)
                        .setContent(content)
                        .on({
                            remove: () => {
                                e.target.setStyle({
                                    weight: 1,
                                    color: '#AAAAAA'
                                });

                                if (grouped) precinctsLayer.eachLayer(featureLayer => {
                                    if (featureLayer.feature.properties[precinctIDField] == e.target.feature.properties[precinctIDField]) featureLayer.setStyle({
                                        weight: 1,
                                        color: '#AAAAAA'
                                    }).bringToFront();
                                });
                            }
                        }).openOn(map);
                }
            });
        }
    }).addTo(map);

    const attachTieDefsRoot = () => {
        if (!precinctsLayer || precinctsLayer._tieDefsRoot) return;

        let firstLayer = precinctsLayer.getLayers()[0];
        let element = firstLayer && firstLayer.getElement && firstLayer.getElement();
        if (element && element.ownerSVGElement) {
            precinctsLayer._tieDefsRoot = element.ownerSVGElement;

            if (window.selector && typeof window.selector._syncTiePatternDefs === 'function') {
                window.selector._syncTiePatternDefs(window.selector._getActiveContest());
                if (window.selector._layer && typeof window.selector._layer.setStyle === 'function' && typeof window.selector._createStyle === 'function') {
                    window.selector._layer.setStyle(window.selector._createStyle());
                }
            }
            return;
        }

        requestAnimationFrame(attachTieDefsRoot);
    };

    requestAnimationFrame(attachTieDefsRoot);
}

function buildElectionSelector(snapshot = getActiveSnapshot(), geographies = getSnapshotGeographies(snapshot), selectedGeography = getSelectedGeography(snapshot, activeGeographyId), selectorStateOverride = null) {
    const existingSelectorUiState = window.selector && typeof window.selector.getUiState === 'function'
        ? window.selector.getUiState()
        : null;
    const legendUiState = window.legend && typeof window.legend.getUiState === 'function'
        ? window.legend.getUiState()
        : null;
    const selectorUiState = selectorStateOverride || existingSelectorUiState;

    if (window.selector) {
        map.removeControl(window.selector);
        window.selector = null;
    }
    if (window.legend) {
        map.removeControl(window.legend);
        window.legend = null;
    }

    if (contests.length) {
        window.selector = L.control.ElectionSelector(pageTitle, precinctsLayer, contests, precinctIDField, {
            geographies,
            selectedGeographyId: selectedGeography?.id || activeGeographyId,
            pinned: selectorUiState?.pinned,
            closed: selectorUiState?.closed,
            opacity: selectorUiState?.opacity,
            colorblindMode: selectorUiState?.colorblindMode,
            selectedContestValue: selectorUiState?.selectedContestValue,
            selectedChoiceValue: selectorUiState?.selectedChoiceValue,
            onGeographyChange: async geographyId => {
                const activeSnapshot = getActiveSnapshot();
                if (!activeSnapshot || isElectionLoadInProgress) return;
                await loadElectionDataset(activeSnapshot, {
                    selectedGeographyId: geographyId,
                    updateUrl: true,
                    closeBrowserOnSuccess: false
                });
            }
        }).addTo(map);
        window.legend = L.control.LegendPanel(window.selector, {
            pinned: legendUiState?.pinned,
            closed: legendUiState?.closed
        }).addTo(map);
        window.selector.setLegendControl(window.legend);

        if (precinctsLayer && precinctsLayer._tieDefsRoot && typeof window.selector._syncTiePatternDefs === 'function') {
            window.selector._syncTiePatternDefs(window.selector._getActiveContest());
        }
    }
}

function applyDefaultMapView() {
    if (precinctsLayer && precinctsLayer.getLayers().length) {
        map.fitBounds(precinctsLayer.getBounds());
    } else {
        map.setView(defaultMapView.center, defaultMapView.zoom);
    }
}

function applyColorblindMode(mode) {
    if (window.selector && window.selector._colorblindMode !== undefined) {
        window.selector._colorblindMode = mode;
        if (window.selector._layer && typeof window.selector._layer.setStyle === 'function' && typeof window.selector._createStyle === 'function') {
            window.selector._layer.setStyle(window.selector._createStyle());
        }
    }

    // Sync the vision mode selector in the map control panel if present
    const panelSelector = document.getElementById('colorblind-mode-selector');
    if (panelSelector) panelSelector.value = mode;
}

function openElectionBrowser() {
    if (!electionBrowserOverlay) return;
    if (!pendingSnapshotId && activeSnapshotId) {
        pendingSnapshotId = activeSnapshotId;
    }
    hasAutoExpandedActiveGroup = false;
    renderElectionBrowserList();
    electionBrowserOverlay.classList.remove('hidden');
}

function closeElectionBrowser() {
    if (!electionBrowserOverlay) return;
    electionBrowserOverlay.classList.add('hidden');
}

function setElectionBrowserStatus(message) {
    if (!electionBrowserStatus) return;
    if (!message) {
        electionBrowserStatus.classList.add('hidden');
        electionBrowserStatus.textContent = '';
        return;
    }

    electionBrowserStatus.textContent = message;
    electionBrowserStatus.classList.remove('hidden');
}

function getShareToggle(toggleName) {
    return document.getElementById(shareToggleIds[toggleName]);
}

function getCurrentHierarchyState(snapshot = getActiveSnapshot()) {
    const electionId = snapshot?.selectionElectionId || snapshot?.electionGroupId || snapshot?.electionId || snapshot?.id || null;
    const snapshotId = snapshot?.id || snapshot?.snapshotId || null;
    const geographyId = snapshot && getSnapshotGeographies(snapshot).length > 1 ? activeGeographyId : null;

    return {
        electionId,
        snapshotId,
        geographyId
    };
}

function buildHierarchyQueryValue(snapshot, options = {}) {
    const {
        includeSnapshotId = true,
        includeLayerId = true
    } = options;

    const { electionId, snapshotId, geographyId } = getCurrentHierarchyState(snapshot);
    if (!electionId) return null;

    const hierarchySegments = [
        encodeHierarchySegment(electionId)
    ];

    if (includeSnapshotId && snapshotId) {
        hierarchySegments.push(encodeHierarchySegment(snapshotId));

        if (includeLayerId && geographyId) {
            hierarchySegments.push(encodeHierarchySegment(geographyId));
        }
    }

    return hierarchySegments.filter(Boolean).join(hierarchySeparator);
}

function preserveReadableHierarchySeparator(urlString) {
    return `${urlString}`.replace(/%7E/gi, hierarchySeparator);
}

function toShareableDataSourceValue(value) {
    const withScheme = applyDataSourceDefaultScheme(value);
    if (!withScheme) return null;

    let parsedUrl;
    try {
        parsedUrl = new URL(withScheme);
    } catch {
        return `${value}`.trim() || null;
    }

    parsedUrl.search = '';
    parsedUrl.hash = '';

    const pathname = parsedUrl.pathname || '/';
    const trimmedPath = pathname.replace(/\/elections\.index\.json$/i, '').replace(/\/+$/, '');
    parsedUrl.pathname = trimmedPath || '/';

    return parsedUrl.toString().replace(/\/$/, '');
}

function getDefaultDataSourceShareValue() {
    for (const indexFile of electionsIndexFiles) {
        const normalized = toShareableDataSourceValue(indexFile);
        if (normalized) return normalized;
    }

    return null;
}

function isDefaultDataSourceValue(value) {
    const normalized = toShareableDataSourceValue(value);
    if (!normalized) return false;

    return electionsIndexFiles.some(indexFile => toShareableDataSourceValue(indexFile) === normalized);
}

function getCurrentDataSourceShareValue() {
    const queryDataSource = getDataSourceFromQuery();
    if (queryDataSource) return toShareableDataSourceValue(queryDataSource);
    if (electionsIndexSourceUrl) return toShareableDataSourceValue(electionsIndexSourceUrl);
    return getDefaultDataSourceShareValue();
}

function getCurrentSelectorUiState() {
    return window.selector && typeof window.selector.getUiState === 'function'
        ? window.selector.getUiState()
        : null;
}

function isDefaultContestShareValue(value) {
    return value === null || value === undefined || `${value}` === '0';
}

function isDefaultViewShareValue(value) {
    return value === null || value === undefined || `${value}` === 'w';
}

function isDefaultVisionShareValue(value) {
    return value === null || value === undefined || `${value}` === 'normal';
}

function isDefaultOpacityShareValue(value) {
    return !Number.isFinite(value) || Number.parseInt(value, 10) === 100;
}

function initializeShareModalOptions() {
    const selectorState = getCurrentSelectorUiState();
    const currentDataSource = getCurrentDataSourceShareValue();
    const usingDefaultDataSource = isDefaultDataSourceValue(currentDataSource);
    const shareDefaults = {
        contest: !isDefaultContestShareValue(selectorState?.selectedContestValue),
        view: !isDefaultViewShareValue(selectorState?.selectedChoiceValue),
        vision: !isDefaultVisionShareValue(selectorState?.colorblindMode),
        opacity: !isDefaultOpacityShareValue(selectorState?.opacity),
        advanced: !!shouldShowLoadDatasetButtonFromQuery(),
        datasource: !!currentDataSource && !usingDefaultDataSource
    };

    Object.entries(shareToggleIds).forEach(([toggleName, toggleId]) => {
        const input = document.getElementById(toggleId);
        if (!input) return;
        input.checked = !!shareDefaults[toggleName];
    });

    const datasourceToggle = getShareToggle('datasource');
    if (shareDatasourceInput) {
        shareDatasourceInput.value = currentDataSource || '';
    }
    if (datasourceToggle) {
        datasourceToggle.disabled = usingDefaultDataSource;
    }
}

function syncShareToggleDependencies() {
    return;
}

function buildShareUrl() {
    const url = new URL(window.location.href);
    url.search = '';

    const activeSnapshot = getActiveSnapshot();
    const selectorState = getCurrentSelectorUiState();
    const includeContest = !!getShareToggle('contest')?.checked;
    const includeView = !!getShareToggle('view')?.checked;
    const includeVision = !!getShareToggle('vision')?.checked;
    const includeOpacity = !!getShareToggle('opacity')?.checked;
    const includeAdvanced = !!getShareToggle('advanced')?.checked;
    const includeDatasource = !!getShareToggle('datasource')?.checked;

    const hierarchyValue = buildHierarchyQueryValue(activeSnapshot, {
        includeSnapshotId: true,
        includeLayerId: true
    });

    if (hierarchyValue) {
        url.searchParams.set(queryParams.election, hierarchyValue);
    }

    if (includeContest && selectorState?.selectedContestValue !== undefined && selectorState?.selectedContestValue !== null) {
        url.searchParams.set(queryParams.contest, `${selectorState.selectedContestValue}`);
    }

    if (includeView && selectorState?.selectedChoiceValue !== undefined && selectorState?.selectedChoiceValue !== null) {
        url.searchParams.set(queryParams.view, `${selectorState.selectedChoiceValue}`);
    }

    if (includeVision && selectorState?.colorblindMode) {
        url.searchParams.set(queryParams.vision, selectorState.colorblindMode);
    }

    if (includeOpacity && Number.isFinite(selectorState?.opacity)) {
        url.searchParams.set(queryParams.opacity, `${selectorState.opacity}`);
    }

    if (includeAdvanced) {
        url.searchParams.set(queryParams.advanced, 'true');
    }

    if (includeDatasource) {
        const dataSourceValue = toShareableDataSourceValue(shareDatasourceInput ? shareDatasourceInput.value.trim() : getCurrentDataSourceShareValue());
        if (dataSourceValue) {
            url.searchParams.set(queryParams.datasource, dataSourceValue);
        }
    }

    return preserveReadableHierarchySeparator(url.toString());
}

function updateShareLinkPreview() {
    if (!shareLinkPreview) return;
    shareLinkPreview.value = buildShareUrl();
}

function setShareCopyStatus(message) {
    if (!shareCopyStatus) return;
    shareCopyStatus.textContent = message;

    if (shareCopyStatusTimeout) {
        clearTimeout(shareCopyStatusTimeout);
        shareCopyStatusTimeout = null;
    }

    if (!message) return;

    shareCopyStatusTimeout = window.setTimeout(() => {
        if (shareCopyStatus) shareCopyStatus.textContent = '';
        shareCopyStatusTimeout = null;
    }, 2400);
}

function fallbackCopyTextToClipboard(text) {
    const tempTextArea = document.createElement('textarea');
    tempTextArea.value = text;
    tempTextArea.setAttribute('readonly', '');
    tempTextArea.style.position = 'absolute';
    tempTextArea.style.left = '-9999px';
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    document.execCommand('copy');
    document.body.removeChild(tempTextArea);
}

async function copyShareLinkToClipboard() {
    const shareUrl = buildShareUrl();

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareUrl);
        } else {
            fallbackCopyTextToClipboard(shareUrl);
        }

        if (shareLinkPreview) shareLinkPreview.value = shareUrl;
        setShareCopyStatus('Share link copied.');
    } catch (error) {
        console.error('Failed to copy share link:', error);
        setShareCopyStatus('Unable to copy link.');
    }
}

function openShareModal() {
    if (!shareOverlay) return;
    initializeShareModalOptions();
    updateShareLinkPreview();
    setShareCopyStatus('');
    shareOverlay.classList.remove('hidden');
}

function closeShareModal() {
    if (!shareOverlay) return;
    shareOverlay.classList.add('hidden');
    setShareCopyStatus('');
}

function renderElectionBrowserList() {
    if (!electionBrowserList) return;

    electionBrowserList.innerHTML = '';

    if (!window.availableElections.length) {
        const empty = document.createElement('div');
        empty.className = 'election-browser-item';
        empty.textContent = 'No election datasets are available.';
        empty.setAttribute('aria-disabled', 'true');
        electionBrowserList.appendChild(empty);
        return;
    }

    const groups = buildElectionGroups(window.availableElections);
    groups.forEach(group => {
        const sortedSnapshots = sortSnapshotsForDisplay(group.snapshots);
        const preferredSnapshot = getPreferredSnapshot(sortedSnapshots);
        const hasMultipleSnapshots = sortedSnapshots.length > 1;
        const hasActiveSnapshot = sortedSnapshots.some(s => s.id === activeSnapshotId);
        const usesSnapshotLabel = sortedSnapshots.some(snapshot => getSnapshotTypeTags(snapshot).length
            || snapshot.resultsTimestamp
            || snapshot.resultstimestamp
            || snapshot.folder);
        const itemLabel = usesSnapshotLabel ? 'snapshot' : 'dataset';
        const itemLabelPlural = usesSnapshotLabel ? 'snapshots' : 'datasets';

        if (hasActiveSnapshot && !hasAutoExpandedActiveGroup) {
            setExpandedElectionGroup(group.id);
            hasAutoExpandedActiveGroup = true;
        }

        const section = document.createElement('section');
        section.className = 'election-browser-group';

        const electionButton = document.createElement('button');
        electionButton.type = 'button';
        electionButton.className = 'election-browser-election-item';
        const electionIsLoadable = !!preferredSnapshot && isLoadableSnapshot(preferredSnapshot);
        if (preferredSnapshot && preferredSnapshot.id === pendingSnapshotId) electionButton.classList.add('selected');
        if (!electionIsLoadable) electionButton.classList.add('unavailable');
        electionButton.disabled = !electionIsLoadable;

        const electionTitle = document.createElement('span');
        electionTitle.className = 'election-browser-item-title';
        electionTitle.textContent = group.label;

        const electionMeta = document.createElement('span');
        electionMeta.className = 'election-browser-item-meta';
        const electionMetaParts = [
            hasMultipleSnapshots ? `${sortedSnapshots.length} ${itemLabelPlural}` : `1 ${itemLabel}`,
            preferredSnapshot?.date,
            preferredSnapshot?.county,
            preferredSnapshot?.state
        ].filter(Boolean);
        electionMeta.textContent = electionMetaParts.join(' • ');

        electionButton.appendChild(electionTitle);
        electionButton.appendChild(electionMeta);
        electionButton.addEventListener('click', async () => {
            if (!preferredSnapshot) return;

            setExpandedElectionGroup(group.id);
            pendingSnapshotId = preferredSnapshot.id;
            renderElectionBrowserList();
        });
        section.appendChild(electionButton);

        const accordionButton = document.createElement('button');
        accordionButton.type = 'button';
        accordionButton.className = 'election-browser-accordion-toggle';
        const accordionExpanded = expandedElectionGroups.has(group.id);
        accordionButton.setAttribute('aria-expanded', accordionExpanded ? 'true' : 'false');
        accordionButton.textContent = hasMultipleSnapshots
            ? `Election ${usesSnapshotLabel ? 'Snapshots' : 'Datasets'} (${sortedSnapshots.length})`
            : `Election ${usesSnapshotLabel ? 'Snapshots' : 'Datasets'}`;
        accordionButton.addEventListener('click', () => {
            toggleExpandedElectionGroup(group.id);

            renderElectionBrowserList();
        });
        section.appendChild(accordionButton);

        const snapshotList = document.createElement('div');
        snapshotList.className = 'election-browser-snapshot-list';
        if (!expandedElectionGroups.has(group.id)) {
            snapshotList.classList.add('collapsed');
        }

        sortedSnapshots.forEach(snapshot => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'election-browser-item election-browser-snapshot-item';
            const loadable = isLoadableSnapshot(snapshot);
            if (snapshot.id === pendingSnapshotId) button.classList.add('selected');
            if (!loadable) button.classList.add('unavailable');
            button.disabled = !loadable;

            const title = document.createElement('span');
            title.className = 'election-browser-item-title';
            title.textContent = getSnapshotDisplayTitle(snapshot);

            const meta = document.createElement('span');
            meta.className = 'election-browser-item-meta';
            const snapshotDateTime = formatSnapshotDateTime(snapshot);
            const snapshotTypeText = getSnapshotTypeTags(snapshot).join(', ');
            const metaParts = [snapshotDateTime, snapshotTypeText, snapshot.county, snapshot.state, snapshot.commit].filter(Boolean);
            if (!loadable) metaParts.push('missing data URLs');
            meta.textContent = metaParts.join(' • ');

            const tagWrap = document.createElement('span');
            tagWrap.className = 'election-browser-tag-wrap';
            const typeTags = getSnapshotTypeTags(snapshot);
            typeTags.forEach(typeTag => {
                const typeTagEl = document.createElement('span');
                typeTagEl.className = 'election-browser-tag';
                typeTagEl.textContent = typeTag;
                tagWrap.appendChild(typeTagEl);
            });

            button.appendChild(title);
            button.appendChild(meta);
            if (tagWrap.childNodes.length) button.appendChild(tagWrap);
            button.addEventListener('click', () => {
                pendingSnapshotId = snapshot.id;
                setExpandedElectionGroup(group.id);
                renderElectionBrowserList();
            });

            snapshotList.appendChild(button);
        });

        section.appendChild(snapshotList);
        electionBrowserList.appendChild(section);
    });

    updateLoadDatasetButtonState();
}

function updateLoadDatasetButtonState() {
    if (!loadElectionDatasetBtn) return;

    const pendingSnapshot = getPendingSnapshot();
    const canLoad = !!pendingSnapshot
        && isLoadableSnapshot(pendingSnapshot)
        && pendingSnapshot.id !== activeSnapshotId
        && !isElectionLoadInProgress;

    loadElectionDatasetBtn.disabled = !canLoad;
}

function getPendingSnapshot() {
    if (!pendingSnapshotId || !Array.isArray(window.availableElections)) return null;
    return window.availableElections.find(snapshot => snapshot.id === pendingSnapshotId || snapshot.snapshotId === pendingSnapshotId) || null;
}

function trackDynamicTitlePageView() {
    if (typeof window.gtag !== 'function') return;

    window.gtag('event', 'page_view', {
        page_title: document.title,
        page_location: window.location.href,
        page_path: `${window.location.pathname}${window.location.search}${window.location.hash}`
    });
}

function applyActiveElectionTitle(snapshot) {
    const electionRecord = getElectionRecordForSnapshot(snapshot);
    const modalTitle = getIntroModalTitle(snapshot, electionRecord) || defaultAppTitle;
    const modalSubtitle = getIntroModalSubtitle(snapshot, electionRecord) || defaultIntroSubtitle;
    const modalDescription = getIntroModalDescription(electionRecord) || defaultIntroDescription;
    const electionTitle = getElectionDisplayTitle(snapshot);

    pageTitle = modalTitle;
    document.title = modalSubtitle || pageTitle;
    trackDynamicTitlePageView();

    if (introTitle) {
        introTitle.textContent = modalTitle;
    }

    if (introSubtitle) {
        introSubtitle.textContent = modalSubtitle;
    }

    if (introDescription) {
        introDescription.textContent = modalDescription;
    }

    updateIntroSnapshotInfo(snapshot);

    if (electionBrowserTitle) {
        electionBrowserTitle.textContent = electionTitle || 'Choose Election Dataset';
    }
}

function updateIntroSnapshotInfo(snapshot) {
    if (!introSnapshotInfo) return;

    if (!snapshot || isFinalSnapshot(snapshot)) {
        introSnapshotInfo.hidden = true;
        introSnapshotInfo.textContent = '';
        return;
    }

    const snapshotType = getSnapshotTypeLabel(snapshot) || 'snapshot';
    const snapshotTime = formatSnapshotDateTime(snapshot) || snapshot?.date || 'Unknown';
    const isPreElection = isPreElectionSnapshot(snapshot);

    const message = isPreElection
        ? `This is pre-election information and does not include election night results. Please check back after polls close on election day.`
        : `This ${snapshotType.toLowerCase()} update is provided for transparency, but these are not the final results.`;

    introSnapshotInfo.textContent = '';

    const dateLine = document.createElement('div');
    dateLine.className = 'intro-snapshot-date';
    dateLine.textContent = `Snapshot Date: ${snapshotTime}`;

    const messageLine = document.createElement('div');
    messageLine.className = 'intro-snapshot-message';
    messageLine.textContent = message;

    introSnapshotInfo.appendChild(dateLine);
    introSnapshotInfo.appendChild(messageLine);
    introSnapshotInfo.hidden = false;
}

function isPreElectionSnapshot(snapshot) {
    if (!snapshot) return false;

    const typeTags = getSnapshotTypeTags(snapshot).map(tag => `${tag}`.toLowerCase());
    if (typeTags.some(tag => tag === 'pre-election' || tag === 'preelection' || tag === 'pre election')) return true;

    const values = [snapshot.phase, snapshot.stage, snapshot.status, snapshot.label, snapshot.title, snapshot.snapshotTitle].filter(Boolean);
    return values.some(value => `${value}`.toLowerCase().includes('pre-election')
        || `${value}`.toLowerCase().includes('preelection')
        || `${value}`.toLowerCase().includes('pre election'));
}

function isFinalSnapshot(snapshot) {
    return getSnapshotTypeTags(snapshot).some(tag => `${tag}`.trim().toLowerCase() === 'final');
}

function getIntroModalTitle(snapshot, electionRecord) {
    if (!snapshot) return null;

    const raw = electionRecord?.title
        || snapshot.electionRecordTitle
        || electionRecord?.electionTitle
        || snapshot.electionTitle
        || snapshot.electionLabel
        || snapshot.electionGroupLabel;

    if (!raw) return null;

    const title = `${raw}`.trim();
    return title || null;
}

function getIntroModalSubtitle(snapshot, electionRecord) {
    if (!snapshot) return null;

    const raw = electionRecord?.subtitle
        || snapshot.electionRecordSubtitle
        || electionRecord?.electionSubtitle
        || snapshot.electionSubtitle
        || null;

    if (!raw) return null;

    const subtitle = `${raw}`.trim();
    return subtitle || null;
}

function getIntroModalDescription(electionRecord) {
    const raw = electionRecord?.description;
    if (!raw) return null;

    const description = `${raw}`.trim();
    return description || null;
}

function getElectionDisplayTitle(snapshot) {
    if (!snapshot) return null;

    const raw = snapshot.electionGroupLabel
        || snapshot.electionLabel
        || snapshot.electionName
        || snapshot.electionTitle
        || snapshot.election
        || snapshot.label
        || snapshot.name;

    if (!raw) return null;

    const title = `${raw}`.trim();
    return title || null;
}

function setExpandedElectionGroup(groupId) {
    expandedElectionGroups.clear();
    if (groupId) expandedElectionGroups.add(groupId);
}

function toggleExpandedElectionGroup(groupId) {
    if (expandedElectionGroups.has(groupId)) {
        expandedElectionGroups.clear();
        return;
    }

    setExpandedElectionGroup(groupId);
}

function parseBooleanQueryValue(value) {
    if (value === null) return false;

    const normalized = String(value).trim().toLowerCase();
    if (normalized === '') return true;

    return !['0', 'false', 'no', 'off'].includes(normalized);
}

function shouldShowLoadDatasetButtonFromQuery() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(queryParams.advanced)) return false;
    return parseBooleanQueryValue(params.get(queryParams.advanced));
}

function applyAdvancedModeUiVisibilityFromQuery() {
    const showAdvancedUi = shouldShowLoadDatasetButtonFromQuery();

    if (introAdvancedAction) {
        introAdvancedAction.hidden = !showAdvancedUi;
    }

    if (openElectionBrowserBtn) {
        openElectionBrowserBtn.hidden = !showAdvancedUi;
    }

    if (!loadElectionDatasetBtn) return;

    loadElectionDatasetBtn.hidden = !showAdvancedUi;
    if (!showAdvancedUi) {
        loadElectionDatasetBtn.disabled = true;
        return;
    }

    updateLoadDatasetButtonState();
}

function getQueryParam(paramName) {
    const params = new URLSearchParams(window.location.search);
    return params.get(paramName);
}

function decodeHierarchySegment(segment) {
    if (!segment) return null;
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

function encodeHierarchySegment(segment) {
    if (segment === null || segment === undefined || segment === '') return null;
    return encodeURIComponent(`${segment}`);
}

function getHierarchySelectionFromQuery() {
    const raw = getQueryParam(queryParams.election);
    if (!raw) return {
        electionId: null,
        snapshotId: null,
        layerId: null
    };

    const segments = `${raw}`
        .split(hierarchySeparator)
        .map(part => part.trim())
        .filter(Boolean)
        .map(decodeHierarchySegment);

    return {
        electionId: segments[0] || null,
        snapshotId: segments[1] || null,
        layerId: segments[2] || null
    };
}

function getElectionIdFromQuery() {
    return getHierarchySelectionFromQuery().electionId;
}

function getSnapshotIdFromQuery() {
    return getHierarchySelectionFromQuery().snapshotId;
}

function getLayerIdFromQuery() {
    return getHierarchySelectionFromQuery().layerId;
}

function getDataSourceFromQuery() {
    return getQueryParam(queryParams.datasource);
}

function getContestFromQuery() {
    const value = getQueryParam(queryParams.contest);
    return value === null || value === '' ? null : `${value}`;
}

function getViewFromQuery() {
    const value = getQueryParam(queryParams.view);
    return value === null || value === '' ? null : `${value}`;
}

function getVisionModeFromQuery() {
    const value = getQueryParam(queryParams.vision);
    if (!value) return null;
    const normalized = `${value}`.trim();
    return supportedVisionModes.has(normalized) ? normalized : null;
}

function getOpacityFromQuery() {
    const value = getQueryParam(queryParams.opacity);
    if (value === null || value === '') return null;

    const parsed = Number.parseInt(`${value}`, 10);
    if (!Number.isFinite(parsed)) return null;
    return Math.min(100, Math.max(0, parsed));
}

function getSelectorStateFromQuery() {
    return {
        selectedContestValue: getContestFromQuery(),
        selectedChoiceValue: getViewFromQuery(),
        colorblindMode: getVisionModeFromQuery(),
        opacity: getOpacityFromQuery()
    };
}

function hasUrlScheme(value) {
    return /^[a-z][a-z\d+\-.]*:\/\//i.test(value);
}

function isLocalDataSourceHost(value) {
    const lower = `${value}`.toLowerCase();
    return lower.startsWith('localhost') || lower.startsWith('127.0.0.1');
}

function applyDataSourceDefaultScheme(value) {
    const trimmed = `${value || ''}`.trim();
    if (!trimmed) return null;
    if (hasUrlScheme(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) return `${window.location.protocol}${trimmed}`;

    const scheme = isLocalDataSourceHost(trimmed) ? 'http://' : 'https://';
    return `${scheme}${trimmed}`;
}

function normalizeDataSourceIndexUrl(dataSourceRaw) {
    const dataSourceWithScheme = applyDataSourceDefaultScheme(dataSourceRaw);
    if (!dataSourceWithScheme) return null;

    let parsedDataSourceUrl;
    try {
        parsedDataSourceUrl = new URL(dataSourceWithScheme);
    } catch {
        return null;
    }

    const pathname = parsedDataSourceUrl.pathname || '/';
    const trimmedPath = pathname.replace(/\/+$/, '');

    if (!trimmedPath.toLowerCase().endsWith('/elections.index.json')) {
        const normalizedBasePath = trimmedPath && trimmedPath !== '/' ? trimmedPath : '';
        parsedDataSourceUrl.pathname = `${normalizedBasePath}/elections.index.json`;
    }

    return parsedDataSourceUrl.toString();
}

function setSelectionQueryParams(snapshot, options = {}) {
    const {
        includeSnapshotId = true,
        includeLayerId = true
    } = options;

    const url = new URL(window.location.href);

    const hierarchyValue = buildHierarchyQueryValue(snapshot, {
        includeSnapshotId: !!includeSnapshotId,
        includeLayerId: !!includeLayerId
    });

    if (!hierarchyValue) {
        url.searchParams.delete(queryParams.election);
        window.history.replaceState({}, '', preserveReadableHierarchySeparator(url.toString()));
        return;
    }

    url.searchParams.set(queryParams.election, hierarchyValue);

    window.history.replaceState({}, '', preserveReadableHierarchySeparator(url.toString()));
}

function getJsonCacheBustToken() {
    if (!window.__jsonCacheBustToken) {
        window.__jsonCacheBustToken = Date.now().toString();
    }

    return window.__jsonCacheBustToken;
}

function withCacheBust(url) {
    if (!url) return url;

    try {
        const resolved = new URL(url, window.location.href);
        resolved.searchParams.set('_cb', getJsonCacheBustToken());
        return resolved.toString();
    } catch {
        return url;
    }
}

function normalizeElectionDataShape(electionData) {
    if (!electionData || typeof electionData !== 'object') return { contests: [] };

    const contests = Array.isArray(electionData.contests)
        ? electionData.contests.map(contest => ({
            ...contest,
            precincts: contest?.precincts
                || contest?.areas
                || contest?.units
                || contest?.geographies
                || contest?.resultsByArea
                || {}
        }))
        : [];

    return {
        ...electionData,
        contests
    };
}

async function loadJson(file) {
    let response = await fetch(withCacheBust(file));
    return await response.json();
}

async function loadJsonWithSource(file) {
    let response = await fetch(withCacheBust(file));
    return {
        data: await response.json(),
        sourceUrl: response.url || new URL(file, window.location.href).toString()
    };
}

async function loadIndexWithFallback(indexFiles) {
    let lastError = null;

    for (const file of indexFiles) {
        try {
            return await loadJsonWithSource(file);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('Unable to load any configured index file.');
}

function resolveIndexPath(pathOrUrl, indexSourceUrl) {
    if (!pathOrUrl) return null;
    if (!indexSourceUrl) return pathOrUrl;

    try {
        return new URL(pathOrUrl, indexSourceUrl).toString();
    } catch {
        return pathOrUrl;
    }
}

function getEntryDataUrl(entry) {
    return entry?.dataUrl || entry?.electionDataUrl || null;
}

function getEntryAreasUrl(entry) {
    return entry?.areasUrl
        || entry?.gisUrl
        || entry?.precinctsUrl
        || entry?.precinctDataUrl
        || entry?.precinctsDataUrl
        || null;
}

function getEntryAreaIdField(entry) {
    return entry?.areaIdField || entry?.joinField || entry?.precinctIdField || null;
}

function getEntryAreaLabelField(entry) {
    return entry?.areaLabelField || entry?.labelField || entry?.precinctLabelField || null;
}

function getEntryLayers(entry) {
    if (Array.isArray(entry?.geographies)) return entry.geographies;
    if (Array.isArray(entry?.layers)) return entry.layers;
    return [];
}

function hasAnyLegacyAreaField(entry) {
    return !!(getEntryDataUrl(entry) || getEntryAreasUrl(entry) || getEntryAreaIdField(entry) || getEntryAreaLabelField(entry));
}

function hasCompleteLegacyAreaMode(entry) {
    return !!(getEntryDataUrl(entry) && getEntryAreasUrl(entry) && getEntryAreaIdField(entry) && getEntryAreaLabelField(entry));
}

function warnSnapshotModeIssue(snapshot, message, context = null) {
    const snapshotId = snapshot?.id || snapshot?.snapshotId || snapshot?.folder || 'unknown';
    const warningKey = `${context || 'snapshot'}:${snapshotId}:${message}`;
    if (snapshotModeWarnings.has(warningKey)) return;
    snapshotModeWarnings.add(warningKey);
    console.warn(`[ElectionSnapshotMode] ${message}`, {
        snapshotId,
        context,
        snapshot
    });
}

function getSnapshotEffectiveMode(snapshot, context = null) {
    const hasLayers = getEntryLayers(snapshot).length > 0;
    const hasLegacyFields = hasAnyLegacyAreaField(snapshot);
    const hasLegacyMode = hasCompleteLegacyAreaMode(snapshot);

    if (hasLayers && hasLegacyFields) {
        warnSnapshotModeIssue(snapshot, 'Snapshot declares both layer and legacy area fields; layer mode will be used.', context);
    }

    if (hasLayers) return 'layers';
    if (hasLegacyMode) return 'legacy';

    if (hasLegacyFields) {
        warnSnapshotModeIssue(snapshot, 'Snapshot has partial legacy area fields and is missing required fields; falling back to inherited/default behavior.', context);
    }

    return 'inherited';
}

function getSnapshotGeographies(snapshot) {
    if (!snapshot) return [];

    const geographies = getEntryLayers(snapshot);
    const normalized = geographies.map((geography, geographyIndex) => ({
        ...geography,
        id: geography?.id || `geography-${geographyIndex + 1}`,
        label: geography?.label || geography?.name || geography?.type || `Layer ${geographyIndex + 1}`,
        dataUrl: getEntryDataUrl(geography) || getEntryDataUrl(snapshot) || null,
        precinctsUrl: getEntryAreasUrl(geography) || getEntryAreasUrl(snapshot) || null,
        precinctIdField: getEntryAreaIdField(geography) || getEntryAreaIdField(snapshot) || null,
        precinctLabelField: getEntryAreaLabelField(geography) || getEntryAreaLabelField(snapshot) || null,
        grouped: geography?.grouped ?? snapshot.grouped
    })).filter(geography => geography.dataUrl && geography.precinctsUrl);

    if (normalized.length) return normalized;

    const fallbackDataUrl = getEntryDataUrl(snapshot);
    const fallbackAreasUrl = getEntryAreasUrl(snapshot);

    if (!fallbackDataUrl || !fallbackAreasUrl) return [];

    return [{
        id: 'default',
        label: snapshot.label || snapshot.title || 'Default Layer',
        dataUrl: fallbackDataUrl,
        precinctsUrl: fallbackAreasUrl,
        precinctIdField: getEntryAreaIdField(snapshot),
        precinctLabelField: getEntryAreaLabelField(snapshot),
        grouped: snapshot.grouped
    }];
}

function getSelectedGeography(snapshot, requestedGeographyId) {
    const geographies = getSnapshotGeographies(snapshot);
    if (!geographies.length) return null;

    if (requestedGeographyId) {
        const requested = geographies.find(geography => idsEqual(geography.id, requestedGeographyId));
        if (requested) return requested;
    }

    return geographies[0];
}

function idsEqual(left, right) {
    if (left === null || left === undefined || right === null || right === undefined) return false;
    return `${left}`.toLowerCase() === `${right}`.toLowerCase();
}

function getSelectedElection(snapshotDatasets, defaultElectionId, requestedElectionId, requestedSnapshotId) {
    if (!Array.isArray(snapshotDatasets) || !snapshotDatasets.length) return null;

    if (requestedSnapshotId) {
        const requestedSnapshot = snapshotDatasets.find(s => idsEqual(s.id, requestedSnapshotId) || idsEqual(s.snapshotId, requestedSnapshotId));
        if (requestedSnapshot) return requestedSnapshot;
    }

    if (requestedElectionId) {
        const requestedElection = snapshotDatasets.find(s => idsEqual(s.id, requestedElectionId) || idsEqual(s.snapshotId, requestedElectionId));
        if (requestedElection) return requestedElection;

        let requestedElectionSnapshots = snapshotDatasets.filter(s => idsEqual(s.electionGroupId, requestedElectionId) && isLoadableSnapshot(s));
        if (requestedElectionSnapshots.length) return getPreferredSnapshot(requestedElectionSnapshots);

        requestedElectionSnapshots = snapshotDatasets.filter(s => idsEqual(s.electionGroupId, requestedElectionId));
        if (requestedElectionSnapshots.length) return getPreferredSnapshot(requestedElectionSnapshots);
    }

    if (defaultElectionId) {
        let defaultSnapshot = snapshotDatasets.find(s => idsEqual(s.id, defaultElectionId) || idsEqual(s.snapshotId, defaultElectionId));
        if (defaultSnapshot) return defaultSnapshot;

        let defaultElectionSnapshots = snapshotDatasets.filter(s => idsEqual(s.electionGroupId, defaultElectionId) && isLoadableSnapshot(s));
        if (defaultElectionSnapshots.length) return getPreferredSnapshot(defaultElectionSnapshots);
    }

    return snapshotDatasets.find(isLoadableSnapshot) || snapshotDatasets[0];
}

function getSnapshotDatasets(index) {
    if (!index) return [];

    const electionEntries = normalizeElectionEntries(index.elections);
    if (electionEntries.length) {
        return normalizeElectionSnapshots(electionEntries);
    }

    if (Array.isArray(index.snapshots) && index.snapshots.length) {
        return normalizeTopLevelSnapshots(index);
    }

    return [];
}

function normalizeElectionEntries(elections) {
    if (Array.isArray(elections)) return elections;
    if (!elections || typeof elections !== 'object') return [];

    return Object.entries(elections).map(([key, election]) => ({
        ...election,
        id: election?.id || key,
        electionId: election?.electionId || key,
        electionLabel: election?.electionLabel || election?.label || key
    }));
}

function normalizeElectionSnapshots(electionEntries) {
    let flattened = [];

    electionEntries.forEach((election, electionIndex) => {
        const electionId = election.id || election.electionId || `election-${electionIndex + 1}`;
        const electionGroupId = election.electionGroupId || election.electionId || election.id || `election-${electionIndex + 1}`;
        const electionGroupLabel = election.electionLabel || election.label || electionGroupId;
        const snapshots = Array.isArray(election.snapshots) && election.snapshots.length
            ? election.snapshots
            : [];

        if (!snapshots.length && isLoadableSnapshot(election)) {
            const electionRecordTitle = getElectionRecordTitleFromElection(election);
            const electionRecordSubtitle = getElectionRecordSubtitleFromElection(election);

            flattened.push({
                ...election,
                id: electionId,
                snapshotId: electionId,
                snapshotLabel: getSnapshotDisplayTitle(election, electionGroupLabel),
                electionRecordTitle,
                electionRecordSubtitle,
                electionGroupId,
                electionGroupLabel,
                selectionElectionId: electionId,
                geographies: getEntryLayers(election),
                dataUrl: getEntryDataUrl(election),
                precinctsUrl: getEntryAreasUrl(election),
                precinctIdField: getEntryAreaIdField(election),
                precinctLabelField: getEntryAreaLabelField(election),
                grouped: election.grouped,
                commit: election.commit
            });

            return;
        }

        snapshots.forEach((snapshot, snapshotIndex) => {
            const snapshotId = snapshot.id || snapshot.snapshotId || snapshot.folder || `${electionGroupId}-snapshot-${snapshotIndex + 1}`;
            const electionRecordTitle = getElectionRecordTitleFromElection(election);
            const electionRecordSubtitle = getElectionRecordSubtitleFromElection(election);
            const mode = getSnapshotEffectiveMode(snapshot, electionGroupId);
            const usesSnapshotLayers = mode === 'layers';
            const usesSnapshotLegacy = mode === 'legacy';
            flattened.push({
                ...election,
                ...snapshot,
                id: snapshotId,
                snapshotId,
                snapshotLabel: getSnapshotDisplayTitle(snapshot, `Snapshot ${snapshotIndex + 1}`),
                electionRecordTitle,
                electionRecordSubtitle,
                electionGroupId,
                electionGroupLabel,
                selectionElectionId: electionGroupId,
                geographies: usesSnapshotLayers
                    ? getEntryLayers(snapshot)
                    : usesSnapshotLegacy
                        ? []
                        : getEntryLayers(snapshot).length
                            ? getEntryLayers(snapshot)
                            : getEntryLayers(election),
                dataUrl: usesSnapshotLayers
                    ? getEntryDataUrl(snapshot)
                    : usesSnapshotLegacy
                        ? getEntryDataUrl(snapshot)
                        : getEntryDataUrl(snapshot) || getEntryDataUrl(election),
                precinctsUrl: usesSnapshotLayers
                    ? getEntryAreasUrl(snapshot)
                    : usesSnapshotLegacy
                        ? getEntryAreasUrl(snapshot)
                        : getEntryAreasUrl(snapshot) || getEntryAreasUrl(election),
                precinctIdField: usesSnapshotLayers
                    ? getEntryAreaIdField(snapshot)
                    : usesSnapshotLegacy
                        ? getEntryAreaIdField(snapshot)
                        : getEntryAreaIdField(snapshot) || getEntryAreaIdField(election),
                precinctLabelField: usesSnapshotLayers
                    ? getEntryAreaLabelField(snapshot)
                    : usesSnapshotLegacy
                        ? getEntryAreaLabelField(snapshot)
                        : getEntryAreaLabelField(snapshot) || getEntryAreaLabelField(election),
                grouped: snapshot.grouped ?? election.grouped,
                commit: snapshot.commit || election.commit
            });
        });
    });

    return flattened;
}

function normalizeTopLevelSnapshots(index) {
    const electionEntries = normalizeElectionEntries(index.elections);
    const electionsById = new Map(electionEntries.map(election => {
        const key = election.electionId || election.id;
        return [key, election];
    }).filter(([key]) => !!key));

    return index.snapshots.map((snapshot, snapshotIndex) => {
        const electionGroupId = snapshot.electionId || snapshot.election || snapshot.electionKey || deriveElectionIdFromFolder(snapshot.folder) || 'snapshots';
        const electionGroupLabel = snapshot.electionLabel || snapshot.electionName || electionGroupId;
        const snapshotId = snapshot.id || snapshot.snapshotId || snapshot.folder || `snapshot-${snapshotIndex + 1}`;
        const parentElection = electionsById.get(electionGroupId) || null;
        const mode = getSnapshotEffectiveMode(snapshot, electionGroupId);
        const usesSnapshotLayers = mode === 'layers';
        const usesSnapshotLegacy = mode === 'legacy';

        return {
            ...snapshot,
            id: snapshotId,
            snapshotId,
            snapshotLabel: getSnapshotDisplayTitle(snapshot, snapshot.folder || `Snapshot ${snapshotIndex + 1}`),
            electionRecordTitle: getElectionRecordTitleFromElection(parentElection),
            electionRecordSubtitle: getElectionRecordSubtitleFromElection(parentElection),
            electionGroupId,
            electionGroupLabel,
            selectionElectionId: electionGroupId,
            geographies: usesSnapshotLayers
                ? getEntryLayers(snapshot)
                : usesSnapshotLegacy
                    ? []
                    : getEntryLayers(parentElection),
            dataUrl: usesSnapshotLayers
                ? getEntryDataUrl(snapshot)
                : usesSnapshotLegacy
                    ? getEntryDataUrl(snapshot)
                    : getEntryDataUrl(snapshot)
                    || getEntryDataUrl(parentElection)
                    || buildSnapshotFileUrl(index, snapshot, 'election.json'),
            precinctsUrl: usesSnapshotLayers
                ? getEntryAreasUrl(snapshot)
                : usesSnapshotLegacy
                    ? getEntryAreasUrl(snapshot)
                    : getEntryAreasUrl(snapshot)
                    || getEntryAreasUrl(parentElection)
                    || buildSnapshotFileUrl(index, snapshot, 'precincts.gis.json'),
            precinctIdField: usesSnapshotLayers
                ? getEntryAreaIdField(snapshot)
                : usesSnapshotLegacy
                    ? getEntryAreaIdField(snapshot)
                    : getEntryAreaIdField(snapshot)
                    || getEntryAreaIdField(parentElection)
                    || getEntryAreaIdField(index)
                    || precinctIDField,
            precinctLabelField: usesSnapshotLayers
                ? getEntryAreaLabelField(snapshot)
                : usesSnapshotLegacy
                    ? getEntryAreaLabelField(snapshot)
                    : getEntryAreaLabelField(snapshot)
                    || getEntryAreaLabelField(parentElection)
                    || getEntryAreaLabelField(index)
                    || precinctLabelField,
            grouped: snapshot.grouped ?? index.grouped,
            date: snapshot.date,
            type: snapshot.type,
            county: snapshot.county,
            state: snapshot.state,
            commit: snapshot.commit
        };
    });
}

function getElectionRecordTitleFromElection(election) {
    if (!election) return null;

    return election.title
        || election.electionTitle
        || election.electionLabel
        || election.label
        || election.name
        || null;
}

function getElectionRecordSubtitleFromElection(election) {
    if (!election) return null;

    return election.subtitle
        || election.electionSubtitle
        || election.description
        || election.summary
        || null;
}

function buildElectionRecordMap(index) {
    const map = new Map();
    const electionEntries = normalizeElectionEntries(index?.elections);

    electionEntries.forEach(election => {
        const keys = [
            election.electionId,
            election.id,
            election.key,
            election.slug,
            election.electionKey,
            election.title,
            election.electionTitle,
            election.electionLabel,
            election.label,
            election.name
        ].filter(Boolean);

        keys.forEach(key => {
            map.set(`${key}`.toLowerCase(), election);
        });
    });

    return map;
}

function getElectionRecordForSnapshot(snapshot) {
    if (!snapshot || !electionRecordsById.size) return null;

    const keys = [
        snapshot.electionGroupId,
        snapshot.electionId,
        snapshot.election,
        snapshot.electionKey,
        snapshot.groupId,
        snapshot.electionGroupLabel,
        snapshot.electionLabel,
        snapshot.electionName
    ].filter(Boolean);

    for (const key of keys) {
        const record = electionRecordsById.get(`${key}`.toLowerCase());
        if (record) return record;
    }

    return null;
}

function deriveElectionIdFromFolder(folder) {
    if (!folder || typeof folder !== 'string') return null;
    const segment = folder.split('/')[0] || folder;
    const match = segment.match(/^\d{4}-\d{2}-\d{2}-(general|primary|special)/i);
    return match ? match[0] : segment;
}

function buildSnapshotFileUrl(index, snapshot, fileName) {
    if (!snapshot?.folder) return null;
    const root = snapshot.baseUrl || index.snapshotBaseUrl || index.baseUrl || index.dataRootUrl;
    if (!root) return null;

    const normalizedRoot = `${root}`.replace(/\/+$/, '');
    const normalizedFolder = `${snapshot.folder}`.replace(/^\/+|\/+$/g, '');
    return `${normalizedRoot}/${normalizedFolder}/${fileName}`;
}

function isLoadableSnapshot(snapshot) {
    if (!snapshot) return false;

    const dataUrl = getEntryDataUrl(snapshot);
    const areasUrl = getEntryAreasUrl(snapshot);
    if (dataUrl && areasUrl) return true;

    const geographies = getSnapshotGeographies(snapshot);
    return geographies.some(geography => geography?.dataUrl && geography?.precinctsUrl);
}

function buildElectionGroups(snapshotDatasets) {
    const groupsById = new Map();

    snapshotDatasets.forEach(snapshot => {
        const groupId = snapshot.electionGroupId || snapshot.id;
        if (!groupsById.has(groupId)) {
            groupsById.set(groupId, {
                id: groupId,
                label: snapshot.electionGroupLabel || snapshot.label || groupId,
                snapshots: []
            });
        }

        groupsById.get(groupId).snapshots.push(snapshot);
    });

    return Array.from(groupsById.values());
}

function getSnapshotTimestamp(snapshot) {
    const candidates = [
        snapshot?.resultstimestamp,
        snapshot?.resultsTimestamp,
        snapshot?.datetime,
        snapshot?.dateTime,
        snapshot?.timestamp,
        snapshot?.updatedAt,
        snapshot?.date
    ].filter(Boolean);

    for (const value of candidates) {
        const t = Date.parse(value);
        if (!Number.isNaN(t)) return t;
    }

    return 0;
}

function formatSnapshotDateTime(snapshot) {
    const raw = snapshot?.resultstimestamp
        || snapshot?.resultsTimestamp
        || snapshot?.datetime
        || snapshot?.dateTime
        || snapshot?.timestamp
        || snapshot?.updatedAt;
    if (!raw) return null;

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return `${raw}`;
    }

    return parsed.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function getSnapshotTypeLabel(snapshot) {
    const tags = getSnapshotTypeTags(snapshot);
    return tags[0] || null;
}

function splitSnapshotTypeValue(raw) {
    if (raw === null || raw === undefined) return [];

    if (Array.isArray(raw)) {
        return raw.flatMap(value => splitSnapshotTypeValue(value));
    }

    if (typeof raw === 'object') {
        return splitSnapshotTypeValue(raw.type || raw.label || raw.name || raw.value || '');
    }

    return `${raw}`
        .split(/[|,]/)
        .map(part => part.trim())
        .filter(Boolean);
}

function getSnapshotTypeTags(snapshot) {
    if (!snapshot) return [];

    const tags = splitSnapshotTypeValue(snapshot.snapshotTypes);
    const seen = new Set();

    return tags.filter(tag => {
        const normalized = `${tag}`.toLowerCase();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });
}

function getSnapshotDisplayTitle(snapshot, fallback = 'Untitled Snapshot') {
    const raw = snapshot?.snapshotTitle
        || snapshot?.title
        || snapshot?.snapshotLabel
        || snapshot?.label
        || snapshot?.subject
        || snapshot?.name
        || snapshot?.folder
        || snapshot?.id;

    if (!raw) return fallback;

    const title = `${raw}`.trim();
    return title || fallback;
}

function getPriorityRank(snapshot) {
    const types = getSnapshotTypeTags(snapshot).map(type => `${type}`.toLowerCase());
    if (types.includes('final')) return 0;
    if (types.includes('latest')) return 1;
    if (types.includes('historical')) return 2;
    if (types.includes('pre-election') || types.includes('preelection') || types.includes('pre election')) return 4;
    return 3;
}

function getPreferredSnapshot(snapshots) {
    if (!Array.isArray(snapshots) || !snapshots.length) return null;

    const loadable = snapshots.filter(isLoadableSnapshot);
    if (!loadable.length) return snapshots[0];

    const ordered = sortSnapshotsForDisplay(loadable);

    return ordered[0];
}

function sortSnapshotsForDisplay(snapshots) {
    return [...snapshots].sort((a, b) => {
        const rankDiff = getPriorityRank(a) - getPriorityRank(b);
        if (rankDiff !== 0) return rankDiff;
        return getSnapshotTimestamp(b) - getSnapshotTimestamp(a);
    });
}

function normalizeWinnerIndices(winner) {
    if (Array.isArray(winner)) return winner.filter(index => index !== undefined && index !== null);
    if (winner === undefined || winner === null) return [];
    return [winner];
}

function getBorderColor(input) {
    if (!input) return 'white';

    let color = typeof input === 'string' ? input : input.fillColor;
    if (Array.isArray(input.tieColors) && input.tieColors.length) color = input.tieColors[0];

    if (!color) return 'white';

    try {
        if (chroma(color).get('hsl.l') < 0.8) return 'white';
        else return 'black';
    } catch (error) {
        return 'black';
    }
}
