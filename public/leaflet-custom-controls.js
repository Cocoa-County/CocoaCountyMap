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

        this._colorScale = chroma.scale(['white', '08306b']);
        this._colorClassifier = ['#1f78b4','#e31a1c','#33a02c','#ff7f00','#6a3d9a','#ffff99','#b15928','#a6cee3','#fb9a99','#b2df8a','#fdbf6f','#cab2d6'];
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
        // Nothing to do here
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
            let winnerColor = this._getChoiceColor(this._contests[selection.contest], precinct.winner);
            return this._buildStyle({
                fillColor: winnerColor || this._colorClassifier[precinct.winner]
            });
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
        return choice.color;
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