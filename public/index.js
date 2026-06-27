const defaultAppTitle = 'Election Map Boilerplate';
const defaultIntroSubtitle = 'Interactive Election Results';
const defaultIntroDescription = 'This interactive map displays precinct-level voting results using your configured election data repository.';
let pageTitle = defaultAppTitle;
let precinctIDField = 'PrecinctID';
let precinctLabelField = 'PrecinctNM';
let grouped = false;
const additionalGISData = false;
const electionsIndexFiles = [
    'https://raw.githubusercontent.com/Cocoa-County/ElectionOpenDataRepository/main/elections.index.json',
    'https://raw.githubusercontent.com/Cocoa-County/ElectionOpenDataRepository/main/snapshots.index.json'
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
const openElectionBrowserBtn = document.getElementById('open-election-browser');
const electionBrowserOverlay = document.getElementById('election-browser-overlay');
const closeElectionBrowserBtn = document.getElementById('close-election-browser');
const loadElectionDatasetBtn = document.getElementById('load-election-dataset');
const electionBrowserTitle = document.getElementById('election-browser-title');
const electionBrowserList = document.getElementById('election-browser-list');
const electionBrowserStatus = document.getElementById('election-browser-status');
const advancedModeQueryParam = 'advanced';

let electionsIndex = null;
let electionsIndexSourceUrl = null;
let electionRecordsById = new Map();
let contests = [];
let data = { contests: [] };
let precinctsLayer = null;
let isElectionLoadInProgress = false;
let activeSnapshotId = null;
let pendingSnapshotId = null;
let electionLoadToken = 0;
const expandedElectionGroups = new Set();
let hasAutoExpandedActiveGroup = false;

window.availableElections = [];

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

applyAdvancedModeUiVisibilityFromQuery();

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && electionBrowserOverlay && !electionBrowserOverlay.classList.contains('hidden')) {
        closeElectionBrowser();
    }
});

// Tour functionality
const tourSteps = [
    {
        title: 'Welcome to the Interactive Map',
        description: 'Click on any precinct to see detailed voting results, turnout information, and registered voter counts.',
        target: null,
        position: 'center'
    },
    {
        title: 'Control Panel',
        description: 'Hover over or click this panel to access map controls. It will expand to show all available options.',
        target: '.election-selector',
        position: 'right'
    },
    {
        title: 'Select a Contest',
        description: 'Use this dropdown to switch between available contest views for the active dataset.',
        target: '.election-selector-select:first-of-type',
        position: 'right'
    },
    {
        title: 'Choose a View',
        description: 'Select how to display results: Winner by Precinct, Contest Turnout, or individual candidate vote percentages.',
        target: '.election-selector-select:last-of-type',
        position: 'right'
    },
    {
        title: 'Adjust Opacity',
        description: 'Use this slider to adjust the map overlay transparency, making it easier to see underlying geographic features.',
        target: '.election-selector-slider',
        position: 'right'
    }
];

let currentTourStep = 0;
const tourOverlay = document.getElementById('tour-overlay');
const tourSpotlight = document.getElementById('tour-spotlight');
const tourContent = document.getElementById('tour-content');
const tourTitle = document.getElementById('tour-title');
const tourDescription = document.getElementById('tour-description');
const tourProgress = document.getElementById('tour-progress');
const tourPrevBtn = document.getElementById('tour-prev');
const tourNextBtn = document.getElementById('tour-next');
const tourSkipBtn = document.getElementById('tour-skip');

function startTour() {
    currentTourStep = 0;
    window.tourActive = true;
    tourOverlay.classList.remove('hidden');
    showTourStep(currentTourStep);
}

function endTour() {
    window.tourActive = false;
    tourOverlay.classList.add('hidden');
    currentTourStep = 0;

    // Close the control panel
    if (window.selector) {
        window.selector._close();
    }
}

function showTourStep(stepIndex) {
    const step = tourSteps[stepIndex];
    tourTitle.textContent = step.title;
    tourDescription.textContent = step.description;
    tourProgress.textContent = `${stepIndex + 1} / ${tourSteps.length}`;

    tourPrevBtn.disabled = stepIndex === 0;
    tourNextBtn.textContent = stepIndex === tourSteps.length - 1 ? 'Finish' : 'Next';

    if (step.target) {
        const targetElement = document.querySelector(step.target);
        if (targetElement) {
            // Expand the control panel if targeting its children
            const controlPanel = document.querySelector('.election-selector');
            if (controlPanel && controlPanel.classList.contains('closed')) {
                controlPanel.classList.remove('closed');
            }

            const rect = targetElement.getBoundingClientRect();
            tourSpotlight.style.top = `${rect.top - 5}px`;
            tourSpotlight.style.left = `${rect.left - 5}px`;
            tourSpotlight.style.width = `${rect.width + 10}px`;
            tourSpotlight.style.height = `${rect.height + 10}px`;
            tourSpotlight.style.display = 'block';

            // Position tour content based on step
            tourContent.style.left = '50%';
            tourContent.style.right = 'auto';
            if (stepIndex === 0) {
                // Step 1: bottom of screen
                tourContent.style.top = 'auto';
                tourContent.style.bottom = '20px';
                tourContent.style.transform = 'translateX(-50%)';
            } else {
                // Steps 2-5: top of screen
                tourContent.style.top = '20px';
                tourContent.style.bottom = 'auto';
                tourContent.style.transform = 'translateX(-50%)';
            }
        }
    } else {
        tourSpotlight.style.display = 'none';
        tourContent.style.left = '50%';
        tourContent.style.right = 'auto';
        if (stepIndex === 0) {
            // Step 1: bottom of screen
            tourContent.style.top = 'auto';
            tourContent.style.bottom = '20px';
            tourContent.style.transform = 'translateX(-50%)';
        } else {
            // Steps 2-5: top of screen
            tourContent.style.top = '20px';
            tourContent.style.bottom = 'auto';
            tourContent.style.transform = 'translateX(-50%)';
        }
    }
}

if (tourPrevBtn) {
    tourPrevBtn.addEventListener('click', () => {
        if (currentTourStep > 0) {
            // Close control panel if we're on step 2 and going back to step 1
            if (currentTourStep === 1 && window.selector) {
                window.selector._container.classList.add('closed');
                window.selector._closed = true;
            }
            currentTourStep--;
            showTourStep(currentTourStep);
        }
    });
}

if (tourNextBtn) {
    tourNextBtn.addEventListener('click', () => {
        if (currentTourStep < tourSteps.length - 1) {
            currentTourStep++;
            showTourStep(currentTourStep);
        } else {
            endTour();
        }
    });
}

if (tourSkipBtn) {
    tourSkipBtn.addEventListener('click', () => {
        endTour();
    });
}

const map = L.map('map', { preferCanvas: false });

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

(async () => {
    try {
        setIntroLoadingState(true, 'Loading election index...');
        const loadedIndex = await loadIndexWithFallback(electionsIndexFiles);
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
            await loadElectionDataset(selectedSnapshot, { updateUrl: true, closeBrowserOnSuccess: false });
        } else {
            applyActiveElectionTitle(null);
            setElectionBrowserStatus('No loadable election datasets were found in the configured index.');
            buildPrecinctLayer({ type: 'FeatureCollection', features: [] });
            buildElectionSelector();
        }
    } catch (error) {
        console.error('Election data load failed:', error);
        applyActiveElectionTitle(null);
        setElectionBrowserStatus('Unable to load election index. Check your configured index URL and try again.');
        buildPrecinctLayer({ type: 'FeatureCollection', features: [] });
        buildElectionSelector();
    }

    setIntroLoadingState(false);
    applyDefaultMapView();
})();

window.addEventListener('popstate', async () => {
    applyAdvancedModeUiVisibilityFromQuery();

    if (!window.availableElections?.length || isElectionLoadInProgress) return;

    const selectedSnapshot = getSelectedElection(
        window.availableElections,
        electionsIndex?.defaultElectionId,
        getElectionIdFromQuery(),
        getSnapshotIdFromQuery()
    );
    if (!selectedSnapshot || selectedSnapshot.id === activeSnapshotId) return;

    await loadElectionDataset(selectedSnapshot, { updateUrl: false, closeBrowserOnSuccess: false });
});

async function loadElectionDataset(snapshot, options = {}) {
    const {
        updateUrl = true,
        closeBrowserOnSuccess = true
    } = options;

    if (!snapshot || !electionsIndexSourceUrl) return;
    if (isElectionLoadInProgress) return;

    const electionDataFile = resolveIndexPath(snapshot.dataUrl, electionsIndexSourceUrl);
    const precinctsFile = resolveIndexPath(snapshot.precinctsUrl, electionsIndexSourceUrl);

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

        data = nextData || { contests: [] };
        contests = Array.isArray(data?.contests) ? data.contests : [];
        precinctIDField = snapshot.precinctIdField || precinctIDField;
        precinctLabelField = snapshot.precinctLabelField || precinctLabelField;
        grouped = snapshot.grouped ?? grouped;
        activeSnapshotId = snapshot.id || null;
        pendingSnapshotId = activeSnapshotId;
        applyActiveElectionTitle(snapshot);

        buildPrecinctLayer(nextPrecincts || { type: 'FeatureCollection', features: [] }, addData);
        buildElectionSelector();
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

function buildElectionSelector() {
    if (window.selector) {
        map.removeControl(window.selector);
        window.selector = null;
    }

    if (contests.length) {
        window.selector = L.control.ElectionSelector(pageTitle, precinctsLayer, contests, precinctIDField).addTo(map);

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
            hasMultipleSnapshots ? `${sortedSnapshots.length} snapshots` : '1 snapshot',
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
            ? `Election Snapshots (${sortedSnapshots.length})`
            : 'Election Snapshots';
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

function applyActiveElectionTitle(snapshot) {
    const electionRecord = getElectionRecordForSnapshot(snapshot);
    const modalTitle = getIntroModalTitle(snapshot, electionRecord) || defaultAppTitle;
    const modalSubtitle = getIntroModalSubtitle(snapshot, electionRecord) || defaultIntroSubtitle;
    const modalDescription = getIntroModalDescription(electionRecord) || defaultIntroDescription;
    const electionTitle = getElectionDisplayTitle(snapshot);

    pageTitle = modalTitle;

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
    if (!params.has(advancedModeQueryParam)) return false;
    return parseBooleanQueryValue(params.get(advancedModeQueryParam));
}

function applyAdvancedModeUiVisibilityFromQuery() {
    const showAdvancedUi = shouldShowLoadDatasetButtonFromQuery();

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

function getQueryParamCaseInsensitive(paramName) {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of params.entries()) {
        if (`${key}`.toLowerCase() === `${paramName}`.toLowerCase()) {
            return value;
        }
    }

    return null;
}

function hasQueryParamCaseInsensitive(paramName) {
    const params = new URLSearchParams(window.location.search);
    for (const key of params.keys()) {
        if (`${key}`.toLowerCase() === `${paramName}`.toLowerCase()) {
            return true;
        }
    }

    return false;
}

function getElectionIdFromQuery() {
    return getQueryParamCaseInsensitive('electionid') || getQueryParamCaseInsensitive('electionId');
}

function getSnapshotIdFromQuery() {
    return getQueryParamCaseInsensitive('snapshotid') || getQueryParamCaseInsensitive('snapshotId');
}

function setSelectionQueryParams(snapshot, options = {}) {
    const {
        includeSnapshotId = null
    } = options;

    const url = new URL(window.location.href);

    const electionId = snapshot?.electionGroupId || snapshot?.electionId || null;
    const snapshotId = snapshot?.id || snapshot?.snapshotId || null;
    const hasSnapshotIdParamInUrl = hasQueryParamCaseInsensitive('snapshotid') || hasQueryParamCaseInsensitive('snapshotId');
    const shouldIncludeSnapshotId = includeSnapshotId === null
        ? hasSnapshotIdParamInUrl
        : !!includeSnapshotId;

    if (electionId) url.searchParams.set('electionid', electionId);
    else url.searchParams.delete('electionid');

    if (shouldIncludeSnapshotId && snapshotId) url.searchParams.set('snapshotid', snapshotId);
    else url.searchParams.delete('snapshotid');

    url.searchParams.delete('electionId');
    url.searchParams.delete('snapshotId');

    window.history.replaceState({}, '', url);
}

async function loadJson(file) {
    let response = await fetch(file);
    return await response.json();
}

async function loadJsonWithSource(file) {
    let response = await fetch(file);
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
        const electionGroupId = election.electionId || election.id || `election-${electionIndex + 1}`;
        const electionGroupLabel = election.electionLabel || election.label || electionGroupId;
        const snapshots = Array.isArray(election.snapshots) && election.snapshots.length
            ? election.snapshots
            : [];

        snapshots.forEach((snapshot, snapshotIndex) => {
            const snapshotId = snapshot.id || snapshot.snapshotId || snapshot.folder || `${electionGroupId}-snapshot-${snapshotIndex + 1}`;
            const electionRecordTitle = getElectionRecordTitleFromElection(election);
            const electionRecordSubtitle = getElectionRecordSubtitleFromElection(election);
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
                dataUrl: snapshot.dataUrl || snapshot.electionDataUrl || election.dataUrl,
                precinctsUrl: snapshot.precinctsUrl || snapshot.precinctDataUrl || snapshot.precinctsDataUrl || election.precinctsUrl,
                precinctIdField: snapshot.precinctIdField || election.precinctIdField,
                precinctLabelField: snapshot.precinctLabelField || election.precinctLabelField,
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

        return {
            ...snapshot,
            id: snapshotId,
            snapshotId,
            snapshotLabel: getSnapshotDisplayTitle(snapshot, snapshot.folder || `Snapshot ${snapshotIndex + 1}`),
            electionRecordTitle: getElectionRecordTitleFromElection(parentElection),
            electionRecordSubtitle: getElectionRecordSubtitleFromElection(parentElection),
            electionGroupId,
            electionGroupLabel,
            dataUrl: snapshot.dataUrl || snapshot.electionDataUrl || buildSnapshotFileUrl(index, snapshot, 'election.json'),
            precinctsUrl: snapshot.precinctsUrl || snapshot.precinctDataUrl || snapshot.precinctsDataUrl || buildSnapshotFileUrl(index, snapshot, 'precincts.gis.json'),
            precinctIdField: snapshot.precinctIdField || index.precinctIdField || precinctIDField,
            precinctLabelField: snapshot.precinctLabelField || index.precinctLabelField || precinctLabelField,
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
    return !!(snapshot?.dataUrl && snapshot?.precinctsUrl);
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
