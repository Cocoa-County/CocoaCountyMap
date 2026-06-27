function createPinButton(buttonClass) {
    let button = L.DomUtil.create('button', `map-panel-pin-btn ${buttonClass}`);
    button.type = 'button';
    button.title = 'Pin panel open';
    button.setAttribute('aria-label', 'Pin panel open');
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 2H8v1l1 1v5l-2 2v1h5v9h1v-9h5v-1l-2-2V4l1-1V2z"></path></svg>';
    return button;
}

function setPinButtonState(button, pinned) {
    if(!button) return;
    button.classList.toggle('pinned', pinned);
    button.title = pinned ? 'Unpin panel' : 'Pin panel open';
    button.setAttribute('aria-label', pinned ? 'Unpin panel' : 'Pin panel open');
    button.setAttribute('aria-pressed', pinned ? 'true' : 'false');
}

L.Control.ElectionSelector = L.Control.extend({
    options: {
        position: 'bottomleft',
    },
    initialize: function (title, layer, contests, precinctIDField, options) {
        this.selection = {};

        this._title = title;

        this._opacity = 100;
        this._closed = false;
        this._pinned = false;
        this._colorblindMode = 'normal';
        this._layer = layer;
        this._contests = contests;
        this._precinctIDField = precinctIDField;
        this._tieDefsContainer = null;
        this._legendControl = null;

        this._colorScale = chroma.scale(['white', '08306b']);
        this._colorClassifier = ['#1f78b4','#e31a1c','#33a02c','#ff7f00','#6a3d9a','#ffff99','#b15928','#a6cee3','#fb9a99','#b2df8a','#fdbf6f','#cab2d6'];
        // Okabe-Ito palette: distinguishable under all common types of color blindness
        this._colorblindSafePalette = ['#0072B2','#D55E00','#009E73','#E69F00','#CC79A7','#56B4E9','#F0E442','#999999'];
        // IBM Carbon high-contrast palette
        this._highContrastPalette = ['#0F62FE','#D02670','#009D9A','#8A3FFC','#DA1E28','#FF832B','#198038','#F1C21B'];
        this._namedChoiceColors = {
            red1: '#e31a1c',
            red2: '#fb9a99',
            red3: '#fb6a4a',
            red4: '#cb181d',
            blue1: '#1f78b4',
            blue2: '#a6cee3',
            blue3: '#6baed6',
            blue4: '#08519c',
            green1: '#33a02c',
            green2: '#b2df8a',
            green3: '#74c476',
            green4: '#238b45',
            orange1: '#ff7f00',
            orange2: '#fdbf6f',
            orange3: '#fd8d3c',
            orange4: '#d94801',
            purple1: '#6a3d9a',
            purple2: '#cab2d6',
            purple3: '#9e9ac8',
            purple4: '#54278f',
            yellow1: '#ffff99',
            yellow2: '#fed976',
            yellow3: '#fdd49e',
            yellow4: '#bdb76b',
            brown1: '#b15928',
            brown2: '#d95f0e',
            brown3: '#8c510a',
            brown4: '#a6761d',
            pink1: '#f781bf',
            pink2: '#fcc5c0',
            pink3: '#dd1c77',
            pink4: '#c51b8a',
            teal1: '#1b9e77',
            teal2: '#66c2a5',
            teal3: '#2ca25f',
            teal4: '#006d2c',
            cyan1: '#17a2b8',
            cyan2: '#9edae5',
            cyan3: '#31a354',
            cyan4: '#3182bd',
            gray1: '#969696',
            gray2: '#bdbdbd',
            gray3: '#737373',
            gray4: '#525252',
            gold1: '#ffd700',
            gold2: '#e6ab02',
            gold3: '#fec44f',
            gold4: '#b8860b'
        };
    },
    onAdd: function(map) {
        let container = this._container = L.DomUtil.create('div', 'election-selector map-panel-control leaflet-bar');

        let drawer = this._drawer = L.DomUtil.create('div', 'election-selector-drawer leaflet-bar', container);
        this._addTitle();
        this._addControls();
        this._contestSelector = L.DomUtil.create('select', 'election-selector-select', drawer);
        this._choiceSelector = L.DomUtil.create('select', 'election-selector-select', drawer);

  		L.DomEvent.disableClickPropagation(container);
  		L.DomEvent.disableScrollPropagation(container);

        this._addContests(Object.values(this._contests));
        this._addChoices(this._contests[this._contestSelector.value].choices);
        this._getTieDefsRoot(true);
        this._syncTiePatternDefs(this._getActiveContest());

        L.DomEvent.on(this._contestSelector, 'change', this._contestChanged, this);
        L.DomEvent.on(this._choiceSelector, 'change', this._choiceChanged, this);

        this._layer.setStyle(this._createStyle());

        L.DomEvent.on(container, {
            mouseenter: function () {
                L.DomEvent.on(container, 'mousedown', L.DomEvent.preventDefault);
                this._open();
                setTimeout(function () {
                    L.DomEvent.off(container, 'mousedown', L.DomEvent.preventDefault);
                });
            },
            mousedown: function () {
                L.DomEvent.on(container, 'mousedown', L.DomEvent.preventDefault);
                this._open();
                setTimeout(function () {
                    L.DomEvent.off(container, 'mousedown', L.DomEvent.preventDefault);
                });
            },
            mouseleave: function (e) {
                if(e.relatedTarget === null || container.contains(e.relatedTarget)) e.stopPropagation();
                else if(!window.tourActive) this._close();
            }
        }, this);

        this._close();
        this._notifyLegendChanged();

        return container;
    },

    onRemove: function(map) {
        this._clearTiePatternDefs();
    },

    _addTitle: function(){
        let pinButton = this._pinButton = createPinButton('election-selector-pin-btn');
        L.DomEvent.on(pinButton, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            this._togglePin();
        }, this);
        let div = L.DomUtil.create('div', 'election-selector-credits', this._drawer);
        setPinButtonState(this._pinButton, this._pinned);
        div.innerHTML = '<p><b>Map Controls</b></p>';
        div.appendChild(pinButton);

        // Add help button
        let helpButton = L.DomUtil.create('button', 'election-selector-help-btn', div);
        helpButton.textContent = 'Help & About';
        L.DomEvent.on(helpButton, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            const introOverlay = document.getElementById('intro-overlay');
            if (introOverlay) {
                introOverlay.classList.remove('hidden');
            }
        }, this);
    },

    _addControls: function(){
        let controls = L.DomUtil.create('div', 'election-selector-controls', this._drawer);

        controls.innerHTML = '<p>Opacity:</p>';

        let slider = L.DomUtil.create('input', 'election-selector-slider', controls);
        slider.type = "range";
        slider.min = 0;
        slider.max = 100;
        slider.value = this._opacity;

        L.DomEvent.on(slider, 'input', (e) => {
            this._opacity = e.target.value;
            this._layer.setStyle(this._createStyle());
        }, this);

        let visionModeRow = L.DomUtil.create('div', 'election-selector-inline-row', controls);
        let visionModeLabel = L.DomUtil.create('label', 'election-selector-inline-label', visionModeRow);
        visionModeLabel.textContent = 'Vision Mode:';
        visionModeLabel.htmlFor = 'colorblind-mode-selector';

        let visionModeSelector = L.DomUtil.create('select', 'election-selector-inline-select', visionModeRow);
        visionModeSelector.id = 'colorblind-mode-selector';
        visionModeSelector.setAttribute('aria-label', 'Select vision mode for colorblind accessibility');

        let modes = [
            { value: 'normal', label: 'Default Colors' },
            { value: 'highContrast', label: 'High Contrast' },
            { value: 'colorblind', label: 'Colorblind-Safe' }
        ];

        modes.forEach(mode => {
            let option = L.DomUtil.create('option', 'election-selector-option', visionModeSelector);
            option.value = mode.value;
            option.textContent = mode.label;
        });

        L.DomEvent.on(visionModeSelector, 'change', (e) => {
            this._colorblindMode = e.target.value;
            this._syncTiePatternDefs(this._getActiveContest());
            this._layer.setStyle(this._createStyle());
            this._notifyLegendChanged();
        }, this);
    },

    _addContests: function(contests) {
        contests.forEach((c, i) => {
            let option = L.DomUtil.create('option', 'election-selector-option', this._contestSelector);
            option.value = i;
            option.textContent = c.label;
        });
    },

    _addChoices: function(choices) {
        let option = L.DomUtil.create('option', 'election-selector-option', this._choiceSelector);
        option.value = "w"
        option.textContent = "WINNER BY PRECINCT";
        option = L.DomUtil.create('option', 'election-selector-option', this._choiceSelector);
        option.value = "t"
        option.textContent = "CONTEST TURNOUT";
        choices.forEach((ch, i) => {
            let option = L.DomUtil.create('option', 'election-selector-option', this._choiceSelector);
            option.value = i;
            option.textContent = ch.label;
        });
    },

    _contestChanged: function() {
        this._close();
        this._layer._map.closePopup();
        L.DomUtil.empty(this._choiceSelector);
        this._addChoices(this._contests[this._contestSelector.value].choices);
        this._syncTiePatternDefs(this._getActiveContest());
        this._layer.setStyle(this._createStyle());
        this._notifyLegendChanged();
        this._layer._map.flyToBounds(this._layer.getLayers().reduce((bounds, feature) => {
            if(this._contests[this.selection.contest].precincts[feature.feature.properties[this._precinctIDField]]) bounds.push(feature.getBounds());
            return bounds;
        }, []));
    },

    _choiceChanged: function() {
        this._layer._map.closePopup();
        this._layer.setStyle(this._createStyle());
        this._notifyLegendChanged();
    },

    _transformColorForColorblindMode: function(hexColor) {
        if (!hexColor || this._colorblindMode === 'normal' || this._colorblindMode === 'colorblind' || this._colorblindMode === 'highContrast' || hexColor.startsWith('url(')) {
            return hexColor;
        }
        return hexColor;
    },

    // Returns the Okabe-Ito palette color for a given choice index, guaranteeing uniqueness.
    _getSafeColorByIndex: function(index) {
        return this._colorblindSafePalette[index % this._colorblindSafePalette.length];
    },

    // Returns the IBM Carbon high-contrast palette color for a given choice index.
    _getHighContrastColorByIndex: function(index) {
        return this._highContrastPalette[index % this._highContrastPalette.length];
    },

    // Returns the gradient scale endpoint for the turnout view.
    _getTurnoutEndColor: function() {
        if (this._colorblindMode === 'highContrast') return '#0F62FE';
        if (this._colorblindMode === 'colorblind') return '#0072B2';
        return '#08306b';
    },

    // Returns the gradient scale endpoint for a specific choice, safe for the active mode.
    _getChoiceScaleEndColor: function(contest, index) {
        if (this._colorblindMode === 'colorblind') return this._getSafeColorByIndex(parseInt(index));
        if (this._colorblindMode === 'highContrast') return this._getHighContrastColorByIndex(parseInt(index));
        return this._getChoiceColor(contest, index) || null;
    },

    // Returns the correct sequential scale for the active mode.
    _getActiveColorScale: function() {
        if (this._colorblindMode === 'highContrast') return chroma.scale(['white', '#0F62FE']);
        if (this._colorblindMode === 'colorblind') return chroma.scale(['white', '#0072B2']);
        return this._colorScale;
    },

    _createStyle: function() {
        let selection = this.selection = {
            contest: this._contestSelector.value,
            choice: this._choiceSelector.value
        };

        if(selection.choice === "w") return feature => {
            let precinct = this._contests[selection.contest].precincts[feature.properties[this._precinctIDField]];
            if(!precinct) return this.styleBlank;
            if(precinct.total == 0) return this._buildStyle({fillColor: 'white'});
            if(!precinct.results) return this._buildStyle(this.styleHidden);
            let winnerStyle = this._getWinnerFill(this._contests[selection.contest], precinct.winner);
            let fallbackColor = this._colorblindMode === 'colorblind' ? this._getSafeColorByIndex(0)
                : this._colorblindMode === 'highContrast' ? this._getHighContrastColorByIndex(0)
                : this._colorClassifier[0];
            let style = winnerStyle || {fillColor: fallbackColor};
            return this._buildStyle(style);
        };
        if(selection.choice === "t") return feature => {
            let precinct = this._contests[selection.contest].precincts[feature.properties[this._precinctIDField]];
            if(!precinct) return this.styleBlank;
            if(precinct.total == 0) return this._buildStyle({fillColor: 'white'});
            return this._buildStyle({fillColor: this._getActiveColorScale()(precinct.total/precinct.registeredVoters/this._contests[selection.contest].voteFor)});
        };
        return feature => {
            let precinct = this._contests[selection.contest].precincts[feature.properties[this._precinctIDField]];
            if(!precinct) return this.styleBlank;
            if(precinct.total == 0) return this._buildStyle({fillColor: 'white'});
            if(!precinct.results) return this._buildStyle(this.styleHidden);
            let endColor = this._getChoiceScaleEndColor(this._contests[selection.contest], selection.choice);
            let colorScale = endColor ? chroma.scale(['white', endColor]) : this._getActiveColorScale();
            return this._buildStyle({fillColor: colorScale(precinct.percentage[selection.choice])});
        };
    },

    _getChoiceColor: function(contest, index) {
        if(!contest || !contest.choices || contest.choices.length === 0) return null;
        let choice = contest.choices[index];
        if(!choice || !choice.color) return null;
        let color = String(choice.color).trim();
        let namedColor = this._namedChoiceColors[color.toLowerCase()];
        return namedColor || color;
    },

    _normalizeWinnerIndices: function(winner) {
        if(Array.isArray(winner)) return winner.filter(index => index !== undefined && index !== null);
        if(winner === undefined || winner === null) return [];
        return [winner];
    },

    _getWinnerColor: function(contest, index) {
        if (this._colorblindMode === 'colorblind') return this._getSafeColorByIndex(index);
        if (this._colorblindMode === 'highContrast') return this._getHighContrastColorByIndex(index);
        return this._getChoiceColor(contest, index) || this._colorClassifier[index % this._colorClassifier.length];
    },

    _getWinnerFill: function(contest, winner) {
        let winnerIndices = this._normalizeWinnerIndices(winner);
        if(!winnerIndices.length) return null;

        let winnerColors = winnerIndices.map(index => this._getWinnerColor(contest, index)).filter(Boolean);
        if(!winnerColors.length) return null;
        if(winnerColors.length === 1) return {fillColor: winnerColors[0]};

        let transformedColors = winnerColors.map(c => this._transformColorForColorblindMode(c));
        let tiePatternUrl = this._getTiePatternUrl(transformedColors);
        return {
            fillColor: tiePatternUrl || transformedColors[0],
            tieColors: transformedColors
        };
    },

    _getTiePatternUrl: function(colors) {
        let patternId = this._getTiePatternId(colors);
        if(this._ensureTiePattern(patternId, colors)) return `url(#${patternId})`;
        return null;
    },

    _getActiveContest: function() {
        if(!this._contestSelector) return null;
        return this._contests[this._contestSelector.value] || null;
    },

    _getTiePatternId: function(colors) {
        return `winner-tie-${colors.map(color => color.replace(/[^a-z0-9]+/gi, '-')).join('-')}`;
    },

    _getTieDefsRoot: function() {
        return this._getTieDefsRootInternal(true);
    },

    _getTieDefsRootInternal: function(createIfMissing) {
        let svg = this._layer && this._layer._tieDefsRoot ? this._layer._tieDefsRoot : null;

        if(!svg && this._layer && this._layer.getLayers) {
            for (let layer of this._layer.getLayers()) {
                let element = layer && layer.getElement && layer.getElement();
                if (element && element.ownerSVGElement) {
                    svg = element.ownerSVGElement;
                    break;
                }
            }
        }

        if(!svg && this._layer && this._layer._path && this._layer._path.ownerSVGElement) {
            svg = this._layer._path.ownerSVGElement;
        }

        if(!svg && this._layer && this._layer._map && this._layer._map._renderer && this._layer._map._renderer._container) {
            svg = this._layer._map._renderer._container;
        }

        if(!svg) return null;

        let defs = svg.querySelector('#winner-tie-defs');
        if(defs) return defs;

        if(!createIfMissing) return null;

        let namespace = 'http://www.w3.org/2000/svg';
        defs = document.createElementNS(namespace, 'defs');
        defs.setAttribute('id', 'winner-tie-defs');
        svg.insertBefore(defs, svg.firstChild);
        return defs;
    },

    _clearTiePatternDefs: function() {
        let defs = this._tieDefsContainer;
        if(defs) {
            L.DomUtil.empty(defs);
        }
    },

    _syncTiePatternDefs: function(contest) {
        if(!contest || !contest.precincts) return;

        let defs = this._getTieDefsRootInternal(true);
        if(!defs) return;
        this._tieDefsContainer = defs;

        L.DomUtil.empty(defs);

        let namespace = 'http://www.w3.org/2000/svg';
        let seenPatterns = new Set();

        Object.values(contest.precincts).forEach(precinct => {
            let winnerIndices = this._normalizeWinnerIndices(precinct.winner);
            if(winnerIndices.length < 2) return;

            let winnerColors = winnerIndices.map(index => this._getWinnerColor(contest, index)).filter(Boolean);
            if(winnerColors.length < 2) return;

            let transformedColors = winnerColors.map(c => this._transformColorForColorblindMode(c));
            let patternId = this._getTiePatternId(transformedColors);
            if(seenPatterns.has(patternId) || defs.querySelector(`#${patternId}`)) return;
            seenPatterns.add(patternId);

            let pattern = document.createElementNS(namespace, 'pattern');
            let stripeSize = 12;
            let patternSize = stripeSize * transformedColors.length;

            pattern.setAttribute('id', patternId);
            pattern.setAttribute('patternUnits', 'userSpaceOnUse');
            pattern.setAttribute('width', patternSize);
            pattern.setAttribute('height', patternSize);
            pattern.setAttribute('patternTransform', 'rotate(45)');
            pattern.setAttribute('patternContentUnits', 'userSpaceOnUse');

            transformedColors.forEach((color, index) => {
                let stripe = document.createElementNS(namespace, 'rect');
                stripe.setAttribute('x', index * stripeSize);
                stripe.setAttribute('y', 0);
                stripe.setAttribute('width', stripeSize);
                stripe.setAttribute('height', patternSize);
                stripe.setAttribute('fill', color);
                pattern.appendChild(stripe);
            });

            defs.appendChild(pattern);
        });
    },

    _ensureTiePattern: function(patternId, colors) {
        let defs = this._getTieDefsRootInternal(true);
        if(!defs) return false;

        if(defs.querySelector(`#${patternId}`)) return true;

        let namespace = 'http://www.w3.org/2000/svg';
        let pattern = document.createElementNS(namespace, 'pattern');
        let stripeSize = 12;
        let patternSize = stripeSize * colors.length;

        pattern.setAttribute('id', patternId);
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');
        pattern.setAttribute('width', patternSize);
        pattern.setAttribute('height', patternSize);
        pattern.setAttribute('patternTransform', 'rotate(45)');
        pattern.setAttribute('patternContentUnits', 'userSpaceOnUse');

        colors.forEach((color, index) => {
            let stripe = document.createElementNS(namespace, 'rect');
            stripe.setAttribute('x', index * stripeSize);
            stripe.setAttribute('y', 0);
            stripe.setAttribute('width', stripeSize);
            stripe.setAttribute('height', patternSize);
            stripe.setAttribute('fill', color);
            pattern.appendChild(stripe);
        });

        defs.appendChild(pattern);
        return true;
    },

    _buildStyle: function(style){
        style.fillOpacity = this._opacity/100;
        return style;
    },

    styleBlank:  {fillOpacity: 0},
    styleHidden: {fillColor: 'lightgray'},

    setLegendControl: function(legendControl) {
        this._legendControl = legendControl || null;
        this._notifyLegendChanged();
    },

    _getLegendState: function() {
        let contestIndex = this._contestSelector ? this._contestSelector.value : this.selection.contest;
        let choiceValue = this._choiceSelector ? this._choiceSelector.value : this.selection.choice;
        let contest = this._contests && contestIndex !== undefined ? this._contests[contestIndex] : null;
        return {
            contestIndex: contestIndex,
            contest: contest || null,
            choice: choiceValue
        };
    },

    _notifyLegendChanged: function() {
        if(this._legendControl && typeof this._legendControl.updateFromSelector === 'function') {
            this._legendControl.updateFromSelector(this._getLegendState());
        }
    },

    _togglePin: function() {
        this._pinned = !this._pinned;
        setPinButtonState(this._pinButton, this._pinned);
    },

    _close: function(force){
        if((window.tourActive || this._pinned) && !force) return;
        this._container.classList.add("closed");
        this._closed = true;
    },

    _open: function(){
        this._container.classList.remove("closed");
        this._closed = false;
    }
});

L.control.ElectionSelector = function(title, layer, contests, precinctIDField, options) {
    return new L.Control.ElectionSelector(title, layer, contests, precinctIDField, options);
};

L.Control.LegendPanel = L.Control.extend({
    options: {
        position: 'bottomleft',
    },

    initialize: function(selector, options) {
        this._selector = selector;
        this._closed = false;
        this._pinned = false;
        this._legendState = null;
        this._fallbackColors = ['#1f78b4','#e31a1c','#33a02c','#ff7f00','#6a3d9a','#ffff99','#b15928','#a6cee3','#fb9a99','#b2df8a','#fdbf6f','#cab2d6'];
    },

    onAdd: function(map) {
        let container = this._container = L.DomUtil.create('div', 'legend-control map-panel-control leaflet-bar');
        let drawer = this._drawer = L.DomUtil.create('div', 'legend-control-drawer leaflet-bar', container);

        this._addTitle();
        this._legendBody = L.DomUtil.create('div', 'legend-control-body', drawer);

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        L.DomEvent.on(container, {
            mouseenter: function () {
                L.DomEvent.on(container, 'mousedown', L.DomEvent.preventDefault);
                this._open();
                setTimeout(function () {
                    L.DomEvent.off(container, 'mousedown', L.DomEvent.preventDefault);
                });
            },
            mousedown: function () {
                L.DomEvent.on(container, 'mousedown', L.DomEvent.preventDefault);
                this._open();
                setTimeout(function () {
                    L.DomEvent.off(container, 'mousedown', L.DomEvent.preventDefault);
                });
            },
            mouseleave: function (e) {
                if(e.relatedTarget === null || container.contains(e.relatedTarget)) e.stopPropagation();
                else this._close();
            }
        }, this);

        this._close();
        this._renderLegend();

        return container;
    },

    _addTitle: function() {
        let pinButton = this._pinButton = createPinButton('legend-control-pin-btn');
        L.DomEvent.on(pinButton, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            this._togglePin();
        }, this);
        let div = L.DomUtil.create('div', 'legend-control-credits', this._drawer);
        setPinButtonState(this._pinButton, this._pinned);
        div.innerHTML = '<p><b>Legend</b></p>';
        div.appendChild(pinButton);
    },

    updateFromSelector: function(legendState) {
        this._legendState = legendState || null;
        this._renderLegend();
    },

    _appendEmptyLegend: function(message) {
        let note = L.DomUtil.create('p', 'legend-empty-note', this._legendBody);
        note.textContent = message;
    },

    _appendSwatchItem: function(label, color) {
        let row = L.DomUtil.create('div', 'legend-item', this._legendBody);
        let text = L.DomUtil.create('span', 'legend-item-label', row);
        text.textContent = label;
        let swatch = L.DomUtil.create('span', 'legend-swatch', row);
        swatch.style.backgroundColor = color;
    },

    _appendGradient: function(title, endColor, minLabel, maxLabel) {
        let block = L.DomUtil.create('div', 'legend-gradient-block', this._legendBody);
        let heading = L.DomUtil.create('p', 'legend-gradient-title', block);
        heading.textContent = title;
        let gradient = L.DomUtil.create('div', 'legend-gradient', block);
        gradient.style.background = `linear-gradient(to right, #ffffff 0%, ${endColor} 100%)`;
        let labels = L.DomUtil.create('div', 'legend-gradient-labels', block);
        let min = L.DomUtil.create('span', 'legend-gradient-label', labels);
        min.textContent = minLabel;
        let max = L.DomUtil.create('span', 'legend-gradient-label', labels);
        max.textContent = maxLabel;
    },

    _getWinnerColor: function(contest, index) {
        if(this._selector && typeof this._selector._getWinnerColor === 'function') {
            return this._selector._getWinnerColor(contest, index);
        }
        return this._fallbackColors[index % this._fallbackColors.length];
    },

    _getChoiceColor: function(contest, index) {
        if(this._selector && typeof this._selector._getChoiceColor === 'function') {
            return this._selector._getChoiceColor(contest, index);
        }
        return null;
    },

    _transformColor: function(color) {
        if(this._selector && typeof this._selector._transformColorForColorblindMode === 'function') {
            return this._selector._transformColorForColorblindMode(color);
        }
        return color;
    },

    _renderLegend: function() {
        if(!this._legendBody) return;
        L.DomUtil.empty(this._legendBody);

        if(!this._legendState || !this._legendState.contest) {
            this._appendEmptyLegend('Load election data to see legend details.');
            return;
        }

        let contest = this._legendState.contest;
        let choice = this._legendState.choice;
        let contestLabel = L.DomUtil.create('p', 'legend-contest-label', this._legendBody);
        contestLabel.textContent = contest.label || 'Selected contest';

        if(choice === 'w') {
            let title = L.DomUtil.create('p', 'legend-mode-label', this._legendBody);
            title.textContent = 'Winner by Precinct';
            if(!contest.choices || !contest.choices.length) {
                this._appendEmptyLegend('No choices available for this contest.');
                return;
            }

            contest.choices.forEach((candidate, index) => {
                this._appendSwatchItem(candidate.label || `Choice ${index + 1}`, this._transformColor(this._getWinnerColor(contest, index)));
            });
            return;
        }

        if(choice === 't') {
            let turnoutTitle = `Contest turnout${contest.voteFor > 1 ? ` (Vote For ${contest.voteFor})` : ''}`;
            let turnoutEnd = (this._selector && this._selector._getTurnoutEndColor) ? this._selector._getTurnoutEndColor() : '#08306b';
            this._appendGradient(turnoutTitle, turnoutEnd, '0%', '100%');
            return;
        }

        let numericChoice = Number.parseInt(choice, 10);
        if(Number.isNaN(numericChoice) || !contest.choices || !contest.choices[numericChoice]) {
            this._appendEmptyLegend('Select a valid view mode to display legend information.');
            return;
        }

        let selectedChoice = contest.choices[numericChoice];
        let choiceLabel = selectedChoice.label || `Choice ${numericChoice + 1}`;
        let endColor = (this._selector && this._selector._getChoiceScaleEndColor) ? (this._selector._getChoiceScaleEndColor(contest, numericChoice) || '#08306b') : (this._getChoiceColor(contest, numericChoice) || '#08306b');
        this._appendGradient(`${choiceLabel} vote share`, endColor, '0%', '100%');
    },

    _togglePin: function() {
        this._pinned = !this._pinned;
        setPinButtonState(this._pinButton, this._pinned);
    },

    _close: function(force) {
        if((window.tourActive || this._pinned) && !force) return;
        this._container.classList.add('closed');
        this._closed = true;
    },

    _open: function() {
        this._container.classList.remove('closed');
        this._closed = false;
    }
});

L.control.LegendPanel = function(selector, options) {
    return new L.Control.LegendPanel(selector, options);
};