L.Control.ElectionSelector = L.Control.extend({
    options: {
        position: 'bottomleft',
    },
    initialize: function (title, layer, contests, precinctIDField, options) {
        this.selection = {};

        this._title = title;

        this._opacity = 100;
        this._closed = false;
        this._layer = layer;
        this._contests = contests;
        this._precinctIDField = precinctIDField;
        this._tieDefsContainer = null;

        this._colorScale = chroma.scale(['white', '08306b']);
        this._colorClassifier = ['#1f78b4','#e31a1c','#33a02c','#ff7f00','#6a3d9a','#ffff99','#b15928','#a6cee3','#fb9a99','#b2df8a','#fdbf6f','#cab2d6'];
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
        let container = this._container = L.DomUtil.create('div', 'election-selector leaflet-bar');

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

        return container;
    },

    onRemove: function(map) {
        this._clearTiePatternDefs();
    },

    _addTitle: function(){
        let div = L.DomUtil.create('div', 'election-selector-credits', this._drawer);

        div.innerHTML = `<p><b>Map Controls</b></p>`;

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
        this._layer._map.flyToBounds(this._layer.getLayers().reduce((bounds, feature) => {
            if(this._contests[this.selection.contest].precincts[feature.feature.properties[this._precinctIDField]]) bounds.push(feature.getBounds());
            return bounds;
        }, []));
    },

    _choiceChanged: function() {
        this._layer._map.closePopup();
        this._layer.setStyle(this._createStyle());
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
            return this._buildStyle(winnerStyle || {fillColor: this._colorClassifier[0]});
        };
        if(selection.choice === "t") return feature => {
            let precinct = this._contests[selection.contest].precincts[feature.properties[this._precinctIDField]];
            if(!precinct) return this.styleBlank;
            if(precinct.total == 0) return this._buildStyle({fillColor: 'white'});
            return this._buildStyle({fillColor: this._colorScale(precinct.total/precinct.registeredVoters/this._contests[selection.contest].voteFor)});
        };
        return feature => {
            let precinct = this._contests[selection.contest].precincts[feature.properties[this._precinctIDField]];
            if(!precinct) return this.styleBlank;
            if(precinct.total == 0) return this._buildStyle({fillColor: 'white'});
            if(!precinct.results) return this._buildStyle(this.styleHidden);
            let choiceColor = this._getChoiceColor(this._contests[selection.contest], selection.choice);
            let colorScale = choiceColor ? chroma.scale(['white', choiceColor]) : this._colorScale;
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
        return this._getChoiceColor(contest, index) || this._colorClassifier[index % this._colorClassifier.length];
    },

    _getWinnerFill: function(contest, winner) {
        let winnerIndices = this._normalizeWinnerIndices(winner);
        if(!winnerIndices.length) return null;

        let winnerColors = winnerIndices.map(index => this._getWinnerColor(contest, index)).filter(Boolean);
        if(!winnerColors.length) return null;
        if(winnerColors.length === 1) return {fillColor: winnerColors[0]};

        let tiePatternUrl = this._getTiePatternUrl(winnerColors);
        return {
            fillColor: tiePatternUrl || winnerColors[0],
            tieColors: winnerColors
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

            let patternId = this._getTiePatternId(winnerColors);
            if(seenPatterns.has(patternId) || defs.querySelector(`#${patternId}`)) return;
            seenPatterns.add(patternId);

            let pattern = document.createElementNS(namespace, 'pattern');
            let stripeSize = 12;
            let patternSize = stripeSize * winnerColors.length;

            pattern.setAttribute('id', patternId);
            pattern.setAttribute('patternUnits', 'userSpaceOnUse');
            pattern.setAttribute('width', patternSize);
            pattern.setAttribute('height', patternSize);
            pattern.setAttribute('patternTransform', 'rotate(45)');
            pattern.setAttribute('patternContentUnits', 'userSpaceOnUse');

            winnerColors.forEach((color, index) => {
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

    _close: function(){
        if(window.tourActive) return;
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
}