const pageTitle = 'Marin County 2022 General Election Results';
const precinctIDField = 'VotingPrecinct';
const precinctLabelField = 'SubPrecinct';
const grouped = true;
const additionalGISData = true;

const map = L.map('map', {preferCanvas: false});

let osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

let data, precinctsLayer;

(async () => {
    let addData;

    data = await loadJson("data/data.json");
    if(additionalGISData) addData = await loadJson("data/add.gis.json");
    let precincts = await loadJson("data/precincts.gis.json");

    precinctsLayer = L.geoJSON(precincts, {
        style: feature => {
            return {
                fillOpacity: 1,
                weight: 1,
                color: "#AAAAAA"
            }
        },
        onEachFeature: (feature, layer) => {
            if(addData){
                let addProps = addData.data[feature.properties[addData.key]];
                if(addProps) Object.assign(feature.properties, addProps);
            }
            layer.on({
                click: e => {
                    let contest = data.contests[selector.selection.contest];
                    let choice = contest.choices[selector.selection.choice];
                    let precinct = contest.precincts[e.target.feature.properties[precinctIDField]];

                    if(grouped) precinctsLayer.eachLayer(feature => {
                        if(feature.feature.properties[precinctIDField] == e.target.feature.properties[precinctIDField]) feature.setStyle({
                            weight: 2,
                            color: getBorderColor(e.target.options.fillColor)
                        }).bringToFront();
                    });

                    e.target.setStyle({
                        weight: 2,
                        color: getBorderColor(e.target.options.fillColor)
                    }).bringToFront();

                    let content = "";

                    if(grouped) content += `<p class=\"popup-title\">${e.target.feature.properties[precinctIDField]} → ${e.target.feature.properties[precinctLabelField]}<br/></p>`
                    else content += `<p class=\"popup-title\">${e.target.feature.properties[precinctLabelField]}<br/></p>`

                    if(!precinct) content += `No Election Results`;
                    else {
                        if(precinct.registeredVoters == 0 && precinct.total == 0) content += "No Registered Voters<br/>";
                        else {
                            if(precinct.total == 0) content += "No Votes<br/";
                            else if(selector.selection.choice === 't') content += `
                                Total Votes: ${precinct.total}<br/>
                                `;
                            else if(!precinct.results) content += `
                                Hidden for Privacy<br/>
                                Total Votes: ${precinct.total}<br/>
                                `;
                            else if(selector.selection.choice === 'w') content += `
                                <p class="popup-subtitle">${contest.choices[precinct.winner].label}</p>
                                Votes: ${precinct.results ? precinct.results[precinct.winner] : 0}/${precinct.total} (${precinct.percentage ? (100 * precinct.percentage[precinct.winner]).toFixed(0) : 0}%)<br/>
                                `;
                            else content += `
                                <p class="popup-subtitle">${choice.label}</p>
                                Votes: ${precinct.results ? precinct.results[selector.selection.choice] : 0}/${precinct.total} (${precinct.percentage ? (100 * precinct.percentage[precinct.winner]).toFixed(0) : 0}%)<br/>
                                `;

                            content += `Registered Voters: ${precinct.registeredVoters}<br/>`;

                            if(precinct.total == precinct.totalVoters) content += `Turnout: ${(100 * precinct.total / precinct.registeredVoters).toFixed(0)}%<br/>`;
                            else content += `
                            Contest Turnout: ${(100 * precinct.total / precinct.registeredVoters).toFixed(0)}%<br/>
                            Ballot Turnout: ${precinct.totalVoters}/${precinct.registeredVoters} (${(100 * precinct.totalVoters / precinct.registeredVoters).toFixed(0)}%)<br/>
                            `
                        }
                    }

                    L.popup()
                    .setLatLng(e.latlng)
                    .setContent(content)
                    .on({remove: () => {
                        e.target.setStyle({
                            weight: 1,
                            color: "#AAAAAA"
                        });
                        
                        if(grouped) precinctsLayer.eachLayer(feature => {
                            if(feature.feature.properties[precinctIDField] == e.target.feature.properties[precinctIDField]) feature.setStyle({
                                weight: 1,
                                color: "#AAAAAA"
                            }).bringToFront();
                        });
                    }}).openOn(map);
                }
            });
        }
    }).addTo(map);
    
    let selector = L.control.ElectionSelector(pageTitle, precinctsLayer, data.contests, precinctIDField).addTo(map);

    map.fitBounds(precinctsLayer.getBounds());
})();

async function loadJson(file) {
    let response = await fetch(file);
    return await response.json();
}

function getBorderColor(input){
    if(!input) return 'white';

    if(chroma(input).get('hsl.l') < 0.8) return 'white';
    else return 'black';
}