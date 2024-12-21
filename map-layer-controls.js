class MapLayerControl {
    constructor(options) {
        this._options = {
            groups: Array.isArray(options) ? options : [options]
        };
        MapLayerControl.instances = (MapLayerControl.instances || 0) + 1;
        this._instanceId = MapLayerControl.instances;
        this._initialized = false;
        this._animationTimeouts = [];
        this._collapsed = window.innerWidth < 768;
        this._sourceControls = [];
        this._editMode = false;
        const editModeToggle = document.getElementById('edit-mode-toggle');
        if (editModeToggle) {
            editModeToggle.addEventListener('click', () => {
                this._editMode = !this._editMode;
                editModeToggle.classList.toggle('active');
                editModeToggle.style.backgroundColor = this._editMode ? '#006dff' : '';
            });
        }
    }

    onAdd(map) {
        this._map = map;

        this._wrapper = $('<div>', {
            class: 'mapboxgl-ctrl mapboxgl-ctrl-group layer-control-wrapper'
        })[0];

        this._toggleButton = $('<button>', {
            class: 'layer-control-toggle' + (this._collapsed ? '' : ' is-open'),
            html: this._collapsed ? '≡' : '×',
            click: (e) => {
                e.stopPropagation();
                this._toggleCollapse();
            }
        })[0];

        this._container = $('<div>', {
            class: 'mapboxgl-ctrl layer-control' + (this._collapsed ? ' collapsed' : '')
        })[0];

        this._wrapper.appendChild(this._toggleButton);
        this._wrapper.appendChild(this._container);

        if (this._map.isStyleLoaded()) {
            this._initializeControl();
        } else {
            this._map.on('style.load', () => {
                this._initializeControl();
            });
        }

        if (window.innerWidth < 768) {
            $(this._container).addClass('collapsed no-transition');
            setTimeout(() => {
                $(this._container).removeClass('no-transition');
            }, 100);
        }

        return this._wrapper;
    }

    _toggleCollapse() {
        this._collapsed = !this._collapsed;
        $(this._container).toggleClass('collapsed');
        $(this._toggleButton)
            .toggleClass('is-open')
            .html(this._collapsed ? '≡' : '×');
    }

    _handleResize() {
        if (window.innerWidth < 768 && !this._collapsed) {
            this._toggleCollapse();
        }
    }

    _initializeControl() {
        const getNextLayerIndex = (type, groupIndex) => {
            const layers = this._map.getStyle().layers;
            const baseLayerIndex = layers.findIndex(layer =>
                layer.type === 'raster' && layer.id.includes('satellite')
            );

            let insertIndex;
            if (type === 'tms' || type === 'raster' || type === 'layer-group' || type === 'osm' || !type) {
                const totalGroups = this._options.groups.length;
                const reversedIndex = totalGroups - (groupIndex || 0) - 1;
                insertIndex = baseLayerIndex + 1 + reversedIndex;
            } else {
                insertIndex = layers.length;
            }

            return insertIndex;
        };

        this._initializeLayers();

        this._options.groups.forEach((group, groupIndex) => {
            const $groupContainer = $('<div>', { class: 'layer-group' });
            const $groupHeader = $('<div>', { class: 'group-header' });

            if (group.headerImage) {
                $groupHeader.css({
                    backgroundImage: `url(${group.headerImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    position: 'relative'
                });

                $('<div>', { class: 'header-overlay' }).appendTo($groupHeader);
            }

            const $label = $('<label>');
            const $checkbox = $('<input>', {
                type: 'checkbox',
                checked: false
            });

            const $titleSpan = $('<span>', { text: group.title });
            if (group.headerImage) {
                $titleSpan.css({
                    color: 'white',
                    position: 'relative',
                    zIndex: '1'
                });
            }

            $label.append($checkbox, $titleSpan);
            $groupHeader.append($label);
            $groupContainer.append($groupHeader);

            const $sourceControl = $('<div>', {
                class: 'source-control collapsed'
            });
            this._sourceControls[groupIndex] = $sourceControl[0];

            const $opacityContainer = $('<div>', {
                class: 'opacity-control mt-2 px-2'
            });

            const $opacitySlider = $('<input>', {
                type: 'range',
                min: '0',
                max: '1',
                step: '0.1',
                value: '1',
                class: 'w-full'
            });

            const $opacityValue = $('<span>', {
                class: 'text-sm text-gray-600 ml-2',
                text: '100%'
            });

            $opacityContainer.append(
                $('<label>', {
                    class: 'block text-sm text-gray-700 mb-1',
                    text: 'Layer Opacity'
                }),
                $('<div>', { class: 'flex items-center' }).append($opacitySlider, $opacityValue)
            );

            $opacitySlider.on('input', (e) => {
                const value = parseFloat(e.target.value);
                $opacityValue.text(`${Math.round(value * 100)}%`);

                if (group.type === 'geojson') {
                    const sourceId = `geojson-${group.id}`;
                    if (this._map.getLayer(`${sourceId}-fill`)) {
                        this._map.setPaintProperty(`${sourceId}-fill`, 'fill-opacity', value * 0.5);
                    }
                    if (this._map.getLayer(`${sourceId}-line`)) {
                        this._map.setPaintProperty(`${sourceId}-line`, 'line-opacity', value);
                    }
                    if (this._map.getLayer(`${sourceId}-label`)) {
                        this._map.setPaintProperty(`${sourceId}-label`, 'text-opacity', value);
                    }
                } else if (group.type === 'tms') {
                    const layerId = `tms-layer-${group.id}`;
                    if (this._map.getLayer(layerId)) {
                        this._map.setPaintProperty(layerId, 'raster-opacity', value);
                    }
                } else if (group.layers) {
                    group.layers.forEach(layer => {
                        if (this._map.getLayer(layer.id)) {
                            const layerType = this._map.getLayer(layer.id).type;
                            switch (layerType) {
                                case 'raster':
                                    this._map.setPaintProperty(layer.id, 'raster-opacity', value);
                                    break;
                                case 'fill':
                                    this._map.setPaintProperty(layer.id, 'fill-opacity', value);
                                    break;
                                case 'line':
                                    this._map.setPaintProperty(layer.id, 'line-opacity', value);
                                    break;
                                case 'symbol':
                                    this._map.setPaintProperty(layer.id, 'text-opacity', value);
                                    this._map.setPaintProperty(layer.id, 'icon-opacity', value);
                                    break;
                            }
                        }
                    });
                } else if (group.type === 'vector') {
                    const sourceId = `vector-${group.id}`;
                    const layerId = `vector-layer-${group.id}`;

                    if (this._map.getLayer(layerId)) {
                        this._map.setPaintProperty(layerId, 'fill-opacity', value * (group.style?.fillOpacity || 0.1));
                        this._map.setPaintProperty(`${layerId}-outline`, 'line-opacity', value);
                    }
                } else {
                    const $radioGroup = $('<div>', { class: 'radio-group' });

                    group.layers.forEach((layer, index) => {
                        const $radioLabel = $('<label>', { class: 'radio-label' });
                        const $radio = $('<input>', {
                            type: 'radio',
                            name: `layer-group-${this._instanceId}-${groupIndex}`,
                            value: layer.id,
                            checked: index === 0
                        });

                        $radio.on('change', () => this._handleLayerChange(layer.id, group.layers));

                        $radioLabel.append(
                            $radio,
                            $('<span>', { text: layer.label })
                        );
                        $radioGroup.append($radioLabel);
                    });

                    $sourceControl.append($radioGroup);
                }
            });

            if (group.type !== 'terrain') {
                $sourceControl.append($opacityContainer);
            }

            if (group.description) {
                $('<div>', {
                    class: 'title',
                    text: group.description
                }).appendTo($sourceControl);
            }

            if (group.type === 'geojson') {
                const sourceId = `geojson-${group.id}`;
                if (!this._map.getSource(sourceId)) {
                    this._map.addSource(sourceId, {
                        type: 'geojson',
                        data: group.data
                    });

                    const style = group.style || {
                        fill: {
                            color: '#ff0000',
                            opacity: 0.5
                        },
                        line: {
                            color: '#ff0000',
                            width: 2
                        },
                        label: {
                            color: '#000000',
                            haloColor: '#ffffff',
                            haloWidth: 2,
                            size: 12
                        }
                    };

                    if (style.fill !== false) {
                        this._map.addLayer({
                            id: `${sourceId}-fill`,
                            type: 'fill',
                            source: sourceId,
                            paint: {
                                'fill-color': style.fill?.color || '#ff0000',
                                'fill-opacity': style.fill?.opacity || 0.5
                            },
                            layout: {
                                'visibility': 'none'
                            }
                        });
                    }

                    this._map.addLayer({
                        id: `${sourceId}-line`,
                        type: 'line',
                        source: sourceId,
                        paint: {
                            'line-color': style.line?.color || '#ff0000',
                            'line-width': style.line?.width || 2
                        },
                        layout: {
                            'visibility': 'none'
                        }
                    });

                    this._map.addLayer({
                        id: `${sourceId}-label`,
                        type: 'symbol',
                        source: sourceId,
                        layout: {
                            'visibility': 'none',
                            'text-field': ['get', 'name'],
                            'text-size': style.label?.size || 12,
                            'text-anchor': 'center',
                            'text-offset': [0, 0],
                            'text-allow-overlap': false,
                            'text-ignore-placement': false
                        },
                        paint: {
                            'text-color': style.label?.color || '#000000',
                            'text-halo-color': style.label?.haloColor || '#ffffff',
                            'text-halo-width': style.label?.haloWidth || 2
                        }
                    });
                }

                if (group.attribution) {
                    $('<div>', {
                        class: 'text-sm text-gray-600 mt-2 px-2',
                        html: group.attribution.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ')
                    }).appendTo($sourceControl);
                }
            } else if (group.type === 'terrain') {
                const $sliderContainer = $('<div>', { class: 'slider-container mt-2' });

                const $contoursContainer = $('<div>', { class: 'mb-4' });
                const $contoursLabel = $('<label>', { class: 'flex items-center' });
                const $contoursCheckbox = $('<input>', {
                    type: 'checkbox',
                    class: 'mr-2',
                    checked: false
                });

                $contoursLabel.append(
                    $contoursCheckbox,
                    $('<span>', {
                        class: 'text-sm text-gray-700',
                        text: 'Contours'
                    })
                );

                $contoursCheckbox.on('change', (e) => {
                    const contourLayers = [
                        'contour lines',
                        'contour labels'
                    ];

                    contourLayers.forEach(layerId => {
                        if (this._map.getLayer(layerId)) {
                            this._map.setLayoutProperty(
                                layerId,
                                'visibility',
                                e.target.checked ? 'visible' : 'none'
                            );
                        }
                    });
                });

                $contoursContainer.append($contoursLabel);
                $sourceControl.append($contoursContainer);

                const $exaggerationSlider = $('<input>', {
                    type: 'range',
                    min: '0',
                    max: '10',
                    step: '0.2',
                    value: '1.5',
                    class: 'w-full'
                });

                const $exaggerationValue = $('<span>', {
                    class: 'text-sm text-gray-600 ml-2',
                    text: '1.5x'
                });

                const $fogContainer = $('<div>', { class: 'mt-4' });
                const $fogSlider = $('<div>', { class: 'fog-range-slider' });

                const $fogStartSlider = $('<input>', {
                    type: 'range',
                    min: '-20',
                    max: '20',
                    step: '0.5',
                    value: '-1',
                    class: 'w-full'
                });

                const $fogEndSlider = $('<input>', {
                    type: 'range',
                    min: '-20',
                    max: '20',
                    step: '0.5',
                    value: '2',
                    class: 'w-full'
                });

                const $fogValue = $('<span>', {
                    class: 'text-sm text-gray-600 ml-2',
                    text: '[-1, 2]'
                });

                const $horizonContainer = $('<div>', { class: 'mt-4' });
                const $horizonSlider = $('<input>', {
                    type: 'range',
                    min: '0',
                    max: '1',
                    step: '0.01',
                    value: '0.3',
                    class: 'w-full'
                });

                const $horizonValue = $('<span>', {
                    class: 'text-sm text-gray-600 ml-2',
                    text: '0.3'
                });

                const $colorContainer = $('<div>', { class: 'mt-4' });
                const $colorPicker = $('<input>', {
                    type: 'color',
                    value: '#ffffff',
                    class: 'w-8 h-8 rounded cursor-pointer'
                });

                const $colorValue = $('<span>', {
                    class: 'text-sm text-gray-600 ml-2',
                    text: '#ffffff'
                });

                const $highColorContainer = $('<div>', { class: 'mt-2' });
                const $highColorPicker = $('<input>', {
                    type: 'color',
                    value: '#add8e6',
                    class: 'w-8 h-8 rounded cursor-pointer'
                });

                const $highColorValue = $('<span>', {
                    class: 'text-sm text-gray-600 ml-2',
                    text: '#add8e6'
                });

                const $spaceColorContainer = $('<div>', { class: 'mt-2' });
                const $spaceColorPicker = $('<input>', {
                    type: 'color',
                    value: '#d8f2ff',
                    class: 'w-8 h-8 rounded cursor-pointer'
                });

                const $spaceColorValue = $('<span>', {
                    class: 'text-sm text-gray-600 ml-2',
                    text: '#d8f2ff'
                });

                $exaggerationSlider.on('input', (e) => {
                    const value = parseFloat(e.target.value);
                    $exaggerationValue.text(`${value}x`);
                    if (this._map.getTerrain()) {
                        this._map.setTerrain({
                            'source': 'mapbox-dem',
                            'exaggeration': value
                        });
                    }
                });

                const updateFog = () => {
                    const start = parseFloat($fogStartSlider.val());
                    const end = parseFloat($fogEndSlider.val());
                    const horizonBlend = parseFloat($horizonSlider.val());
                    const fogColor = $colorPicker.val();
                    const highColor = $highColorPicker.val();
                    const spaceColor = $spaceColorPicker.val();

                    $fogValue.text(`[${start.toFixed(1)}, ${end.toFixed(1)}]`);

                    if (this._map.getFog()) {
                        this._map.setFog({
                            'range': [start, end],
                            'horizon-blend': horizonBlend,
                            'color': fogColor,
                            'high-color': highColor,
                            'space-color': spaceColor,
                            'star-intensity': 0.0
                        });
                    }
                };

                $fogStartSlider.on('input', (e) => {
                    const start = parseFloat(e.target.value);
                    const end = parseFloat($fogEndSlider.val());
                    if (start < end) {
                        updateFog();
                    }
                });

                $fogEndSlider.on('input', (e) => {
                    const start = parseFloat($fogStartSlider.val());
                    const end = parseFloat(e.target.value);
                    if (end > start) {
                        updateFog();
                    }
                });

                $horizonSlider.on('input', (e) => {
                    const value = parseFloat(e.target.value);
                    $horizonValue.text(value.toFixed(2));
                    updateFog();
                });

                $colorPicker.on('input', (e) => {
                    const color = e.target.value;
                    $colorValue.text(color);
                    updateFog();
                });

                $highColorPicker.on('input', (e) => {
                    const color = e.target.value;
                    $highColorValue.text(color);
                    updateFog();
                });

                $spaceColorPicker.on('input', (e) => {
                    const color = e.target.value;
                    $spaceColorValue.text(color);
                    updateFog();
                });

                $sliderContainer.append(
                    $('<label>', {
                        class: 'block text-sm text-gray-700 mb-1',
                        text: 'Terrain Exaggeration'
                    }),
                    $('<div>', { class: 'flex items-center' }).append($exaggerationSlider, $exaggerationValue)
                );

                $fogContainer.append(
                    $('<label>', {
                        class: 'block text-sm text-gray-700 mb-1',
                        text: 'Fog Range'
                    }),
                    $fogSlider.append($fogStartSlider, $fogEndSlider),
                    $('<div>', { class: 'flex items-center' }).append($fogValue)
                );

                $horizonContainer.append(
                    $('<label>', {
                        class: 'block text-sm text-gray-700 mb-1',
                        text: 'Horizon Blend'
                    }),
                    $('<div>', { class: 'flex items-center' }).append($horizonSlider, $horizonValue)
                );

                $colorContainer.append(
                    $('<label>', {
                        class: 'block text-sm text-gray-700 mb-1',
                        text: 'Fog Color'
                    }),
                    $('<div>', { class: 'flex items-center' }).append($colorPicker, $colorValue),

                    $('<label>', {
                        class: 'block text-sm text-gray-700 mb-1 mt-2',
                        text: 'High Color'
                    }),
                    $('<div>', { class: 'flex items-center' }).append($highColorPicker, $highColorValue),

                    $('<label>', {
                        class: 'block text-sm text-gray-700 mb-1 mt-2',
                        text: 'Space Color'
                    }),
                    $('<div>', { class: 'flex items-center' }).append($spaceColorPicker, $spaceColorValue)
                );

                const $fogSettingsContainer = $('<div>', { class: 'mt-4' });
                const $fogSettingsLabel = $('<label>', { class: 'flex items-center' });
                const $fogSettingsCheckbox = $('<input>', {
                    type: 'checkbox',
                    class: 'mr-2',
                    checked: false
                });

                $fogSettingsLabel.append(
                    $fogSettingsCheckbox,
                    $('<span>', {
                        class: 'text-sm text-gray-700',
                        text: 'Fog Settings'
                    })
                );

                const $fogSettingsContent = $('<div>', {
                    class: 'fog-settings-content mt-2 hidden'
                });

                $fogSettingsContent.append(
                    $fogContainer,
                    $horizonContainer,
                    $colorContainer
                );

                $fogSettingsCheckbox.on('change', (e) => {
                    $fogSettingsContent.toggleClass('hidden', !e.target.checked);
                });

                $fogSettingsContainer.append($fogSettingsLabel, $fogSettingsContent);

                $sourceControl.append(
                    $sliderContainer,
                    $fogSettingsContainer
                );
            } else if (group.type === 'tms') {
                const sourceId = `tms-${group.id}`;
                const layerId = `tms-layer-${group.id}`;

                if (!this._map.getSource(sourceId)) {
                    this._map.addSource(sourceId, {
                        type: 'raster',
                        tiles: [group.url],
                        tileSize: 256,
                    });

                    this._map.addLayer({
                        id: layerId,
                        type: 'raster',
                        source: sourceId,
                        layout: {
                            visibility: 'none'
                        },
                        paint: {
                            'raster-opacity': group.opacity || 1
                        }
                    }, this._getInsertPosition('tms', groupIndex));
                }

                if (group.attribution) {
                    $('<div>', {
                        class: 'text-sm text-gray-600 mt-2 px-2',
                        html: group.attribution.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ')
                    }).appendTo($sourceControl);
                }
            } else if (group.type === 'vector') {
                const sourceId = `vector-${group.id}`;
                const layerId = `vector-layer-${group.id}`;

                if (!this._map.getSource(sourceId)) {
                    this._map.addSource(sourceId, {
                        type: 'vector',
                        tiles: [group.url],
                        maxzoom: 15,
                        promoteId: group.inspect?.id || 'id'
                    });

                    this._map.addLayer({
                        id: layerId,
                        type: 'fill',
                        source: sourceId,
                        'source-layer': group.sourceLayer || 'default',
                        layout: {
                            visibility: 'none'
                        },
                        paint: {
                            'fill-color': group.style?.color || '#FF0000',
                            'fill-opacity': group.style?.fillOpacity || 0.1
                        }
                    }, this._getInsertPosition('vector'));

                    this._map.addLayer({
                        id: `${layerId}-outline`,
                        type: 'line',
                        source: sourceId,
                        'source-layer': group.sourceLayer || 'default',
                        layout: {
                            visibility: 'none'
                        },
                        paint: {
                            'line-color': group.style?.color || '#FF0000',
                            'line-width': group.style?.width || 1,
                            'line-opacity': 1
                        }
                    }, this._getInsertPosition('vector'));

                    if (group.inspect) {
                        const popup = new mapboxgl.Popup({
                            closeButton: true,
                            closeOnClick: true
                        });

                        const hoverPopup = new mapboxgl.Popup({
                            closeButton: false,
                            closeOnClick: false,
                            className: 'hover-popup'
                        });

                        let hoveredFeatureId = null;
                        let selectedFeatureId = null;

                        const sourceLayer = group.sourceLayer || 'default';

                        [layerId, `${layerId}-outline`].forEach(id => {
                            if (id === layerId) {
                                this._map.setPaintProperty(id, 'fill-opacity', [
                                    'case',
                                    ['boolean', ['feature-state', 'selected'], false],
                                    0.2,
                                    ['boolean', ['feature-state', 'hover'], false],
                                    0.8,
                                    group.style?.fillOpacity || 0.1
                                ]);
                            } else {
                                this._map.setPaintProperty(id, 'line-width', [
                                    'case',
                                    ['boolean', ['feature-state', 'selected'], false],
                                    4,
                                    ['boolean', ['feature-state', 'hover'], false],
                                    3,
                                    group.style?.width || 1
                                ]);

                                this._map.setPaintProperty(id, 'line-color', [
                                    'case',
                                    ['boolean', ['feature-state', 'selected'], false],
                                    '#000000',
                                    group.style?.color || '#FF0000'
                                ]);
                            }

                            this._map.on('mousemove', id, (e) => {
                                if (e.features.length > 0) {
                                    const feature = e.features[0];

                                    if (hoveredFeatureId !== null) {
                                        this._map.setFeatureState(
                                            {
                                                source: sourceId,
                                                sourceLayer: sourceLayer,
                                                id: hoveredFeatureId
                                            },
                                            { hover: false }
                                        );
                                    }
                                    hoveredFeatureId = feature.id;
                                    this._map.setFeatureState(
                                        {
                                            source: sourceId,
                                            sourceLayer: sourceLayer,
                                            id: hoveredFeatureId
                                        },
                                        { hover: true }
                                    );

                                    if (group.inspect?.label) {
                                        const labelValue = feature.properties[group.inspect.label];
                                        if (labelValue) {
                                            hoverPopup
                                                .setLngLat(e.lngLat)
                                                .setDOMContent(this._createPopupContent(feature, group, true))
                                                .addTo(this._map);
                                        }
                                    }
                                }
                            });

                            this._map.on('mouseleave', id, () => {
                                if (hoveredFeatureId !== null) {
                                    this._map.setFeatureState(
                                        {
                                            source: sourceId,
                                            sourceLayer: sourceLayer,
                                            id: hoveredFeatureId
                                        },
                                        { hover: false }
                                    );
                                    hoveredFeatureId = null;
                                }

                                hoverPopup.remove();
                            });

                            this._map.on('click', id, (e) => {
                                if (this._editMode) {
                                    const lat = e.lngLat.lat.toFixed(6);
                                    const lng = e.lngLat.lng.toFixed(6);
                                    const visibleLayers = this._getVisibleLayers();
                                    const layersParam = encodeURIComponent(JSON.stringify(visibleLayers));
                                    const formUrl = `https://docs.google.com/forms/d/e/1FAIpQLScdWsTn3VnG8Xwh_zF7euRTyXirZ-v55yhQVLsGeWGwtX6MSQ/viewform?usp=pp_url&entry.1264011794=${lat}&entry.1677697288=${lng}&entry.650960474=${layersParam}`;

                                    new mapboxgl.Popup()
                                        .setLngLat(e.lngLat)
                                        .setHTML(`
                                            <div class="p-2">
                                                <p class="mb-2">Location: ${lat}, ${lng}</p>
                                                <p class="mb-2 text-xs text-gray-600">Visible layers: ${visibleLayers}</p>
                                                <a href="${formUrl}" target="_blank" class="text-blue-500 hover:text-blue-700 underline">Add note for this location</a>
                                            </div>
                                        `)
                                        .addTo(this._map);
                                    return;
                                }

                                if (e.features.length > 0) {
                                    const feature = e.features[0];

                                    if (selectedFeatureId !== null) {
                                        this._map.setFeatureState(
                                            {
                                                source: sourceId,
                                                sourceLayer: sourceLayer,
                                                id: selectedFeatureId
                                            },
                                            { selected: false }
                                        );
                                    }

                                    selectedFeatureId = feature.id;
                                    this._map.setFeatureState(
                                        {
                                            source: sourceId,
                                            sourceLayer: sourceLayer,
                                            id: selectedFeatureId
                                        },
                                        { selected: true }
                                    );

                                    const content = this._createPopupContent(feature, group, false, e.lngLat);

                                    popup
                                        .setLngLat(e.lngLat)
                                        .setDOMContent(content)
                                        .addTo(this._map);
                                }
                            });

                            this._map.on('mouseenter', id, () => {
                                this._map.getCanvas().style.cursor = 'pointer';
                            });

                            this._map.on('mouseleave', id, () => {
                                this._map.getCanvas().style.cursor = '';
                            });
                        });
                    }
                }

                if (group.attribution) {
                    $('<div>', {
                        class: 'text-sm text-gray-600 mt-2 px-2',
                        html: group.attribution.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ')
                    }).appendTo($sourceControl);
                }
            } else if (group.type === 'markers' && group.dataUrl) {
                fetch(group.dataUrl)
                    .then(response => response.text())
                    .then(data => {
                        data = gstableToArray(JSON.parse(data.slice(47, -2)).table)
                        const sourceId = `markers-${group.id}`;

                        if (!this._map.getSource(sourceId)) {
                            this._map.addSource(sourceId, {
                                type: 'geojson',
                                data: {
                                    type: 'FeatureCollection',
                                    features: data.map(item => ({
                                        type: 'Feature',
                                        geometry: { type: 'Point', coordinates: [item.Longitude, item.Latitude] },
                                        properties: item
                                    }))
                                }
                            });

                            this._map.addLayer({
                                id: `${sourceId}-circles`,
                                type: 'circle',
                                source: sourceId,
                                paint: {
                                    'circle-radius': group.style?.radius || 6,
                                    'circle-color': group.style?.color || '#FF0000',
                                    'circle-opacity': 0.9,
                                    'circle-stroke-width': 1,
                                    'circle-stroke-color': '#ffffff'
                                },
                                layout: {
                                    'visibility': 'none'
                                }
                            });

                            this._map.on('click', `${sourceId}-circles`, (e) => {
                                if (e.features.length > 0) {
                                    const feature = e.features[0];
                                    const coordinates = feature.geometry.coordinates.slice();
                                    const content = this._createPopupContent(feature, group, false, {
                                        lng: coordinates[0],
                                        lat: coordinates[1]
                                    });
                                    new mapboxgl.Popup()
                                        .setLngLat(coordinates)
                                        .setDOMContent(content)
                                        .addTo(this._map);
                                }
                            });
                        }
                    });
            } else {
                const $radioGroup = $('<div>', { class: 'radio-group' });

                group.layers.forEach((layer, index) => {
                    const $radioLabel = $('<label>', { class: 'radio-label' });
                    const $radio = $('<input>', {
                        type: 'radio',
                        name: `layer-group-${this._instanceId}-${groupIndex}`,
                        value: layer.id,
                        checked: index === 0
                    });

                    $radio.on('change', () => this._handleLayerChange(layer.id, group.layers));

                    $radioLabel.append(
                        $radio,
                        $('<span>', { text: layer.label })
                    );
                    $radioGroup.append($radioLabel);
                });

                $sourceControl.append($radioGroup);
            }

            if (group.legendImage) {
                const $legendContainer = $('<div>', {
                    class: 'legend-container mt-4 px-2'
                });

                const $legendImage = $('<img>', {
                    src: group.legendImage,
                    class: 'w-full rounded-lg shadow-sm cursor-pointer',
                    alt: 'Layer Legend'
                });

                const $legendToggle = $('<button>', {
                    class: 'text-sm text-gray-700 flex items-center gap-2 mb-2 hover:text-gray-900',
                    html: '<span class="legend-icon">▼</span> Show Legend'
                });

                const $legendContent = $('<div>', {
                    class: 'legend-content hidden'
                }).append($legendImage);

                const $modal = $('<div>', {
                    class: 'legend-modal hidden',
                    click: (e) => {
                        if (e.target === $modal[0]) {
                            $modal.addClass('hidden');
                        }
                    }
                });

                const $modalContent = $('<div>', {
                    class: 'legend-modal-content'
                });

                const $modalImage = $('<img>', {
                    src: group.legendImage,
                    alt: 'Layer Legend (Full Size)'
                });

                const $closeButton = $('<button>', {
                    class: 'legend-modal-close',
                    html: '×',
                    click: () => $modal.addClass('hidden')
                });

                $modalContent.append($closeButton, $modalImage);
                $modal.append($modalContent);
                $('body').append($modal);

                $legendImage.on('click', () => {
                    $modal.removeClass('hidden');
                });

                $legendToggle.on('click', () => {
                    $legendContent.toggleClass('hidden');
                    const $icon = $legendToggle.find('.legend-icon');
                    $icon.text($legendContent.hasClass('hidden') ? '▼' : '▲');
                    $legendToggle.html(`${$icon[0].outerHTML} ${$legendContent.hasClass('hidden') ? 'Show' : 'Hide'} Legend`);
                });

                $legendContainer.append($legendToggle, $legendContent);
                $sourceControl.append($legendContainer);
            }

            $groupContainer.append($sourceControl);
            $(this._container).append($groupContainer);

            $checkbox.on('change', () => {
                const isChecked = $checkbox.prop('checked');
                this._toggleSourceControl(groupIndex, isChecked);
            });
        });

        if (!this._initialized) {
            this._initializeWithAnimation();
        }

        window.addEventListener('resize', () => this._handleResize());
    }

    _initializeLayers() {
        this._options.groups.forEach(group => {
            if (!group.layers || group.type === 'terrain') return;

            group.layers.forEach(layer => {
                if (this._map.getLayer(layer.id)) {
                    this._map.setLayoutProperty(
                        layer.id,
                        'visibility',
                        'none'
                    );
                }
            });
        });
    }

    _toggleSourceControl(groupIndex, isChecked) {
        const sourceControl = this._sourceControls[groupIndex];
        const group = this._options.groups[groupIndex];

        if (isChecked) {
            sourceControl.classList.remove('collapsed');

            if (group.type === 'vector') {
                const layerId = `vector-layer-${group.id}`;
                if (this._map.getLayer(layerId)) {
                    this._map.setLayoutProperty(layerId, 'visibility', 'visible');
                    this._map.setLayoutProperty(`${layerId}-outline`, 'visibility', 'visible');
                }
            } else if (group.type === 'geojson') {
                const sourceId = `geojson-${group.id}`;
                if (this._map.getLayer(`${sourceId}-fill`)) {
                    this._map.setLayoutProperty(`${sourceId}-fill`, 'visibility', 'visible');
                }
                this._map.setLayoutProperty(`${sourceId}-line`, 'visibility', 'visible');
                this._map.setLayoutProperty(`${sourceId}-label`, 'visibility', 'visible');
            } else if (group.type === 'terrain') {
                this._map.setTerrain({
                    'source': 'mapbox-dem',
                    'exaggeration': 1.5
                });
            } else if (group.type === 'tms') {
                const layerId = `tms-layer-${group.id}`;
                if (this._map.getLayer(layerId)) {
                    this._map.setLayoutProperty(layerId, 'visibility', 'visible');
                }
            } else if (group.layers && group.layers.length > 0) {
                const firstLayer = group.layers[0];
                if (this._map.getLayer(firstLayer.id)) {
                    this._map.setLayoutProperty(
                        firstLayer.id,
                        'visibility',
                        'visible'
                    );

                    const firstRadio = sourceControl.querySelector(`input[value="${firstLayer.id}"]`);
                    if (firstRadio) {
                        firstRadio.checked = true;
                        this._handleLayerChange(firstLayer.id, group.layers);
                    }
                }
            } else if (group.type === 'markers') {
                const sourceId = `markers-${group.id}`;
                if (this._map.getLayer(`${sourceId}-circles`)) {
                    this._map.setLayoutProperty(`${sourceId}-circles`, 'visibility', 'visible');
                }
            }
        } else {
            sourceControl.classList.add('collapsed');

            if (group.type === 'vector') {
                const layerId = `vector-layer-${group.id}`;
                if (this._map.getLayer(layerId)) {
                    this._map.setLayoutProperty(layerId, 'visibility', 'none');
                    this._map.setLayoutProperty(`${layerId}-outline`, 'visibility', 'none');
                }
            } else if (group.type === 'geojson') {
                const sourceId = `geojson-${group.id}`;
                if (this._map.getLayer(`${sourceId}-fill`)) {
                    this._map.setLayoutProperty(`${sourceId}-fill`, 'visibility', 'none');
                }
                this._map.setLayoutProperty(`${sourceId}-line`, 'visibility', 'none');
                this._map.setLayoutProperty(`${sourceId}-label`, 'visibility', 'none');
            } else if (group.type === 'terrain') {
                this._map.setTerrain(null);
            } else if (group.type === 'tms') {
                const layerId = `tms-layer-${group.id}`;
                if (this._map.getLayer(layerId)) {
                    this._map.setLayoutProperty(layerId, 'visibility', 'none');
                }
            } else if (group.layers) {
                group.layers.forEach(layer => {
                    if (this._map.getLayer(layer.id)) {
                        this._map.setLayoutProperty(
                            layer.id,
                            'visibility',
                            'none'
                        );
                    }
                });
            } else if (group.type === 'markers') {
                const sourceId = `markers-${group.id}`;
                if (this._map.getLayer(`${sourceId}-circles`)) {
                    this._map.setLayoutProperty(`${sourceId}-circles`, 'visibility', 'none');
                }
            }
        }
    }

    _handleLayerChange(selectedLayerId, layers) {
        layers.forEach(layer => {
            if (this._map.getLayer(layer.id)) {
                const isVisible = layer.id === selectedLayerId;
                this._map.setLayoutProperty(
                    layer.id,
                    'visibility',
                    isVisible ? 'visible' : 'none'
                );

                const $radioInput = $(`input[value="${layer.id}"]`, this._container);
                if ($radioInput.length) {
                    const $label = $radioInput.closest('.radio-label');
                    $('.layer-info', $label.parent()).remove();

                    if (isVisible) {
                        const links = [];
                        if (layer.sourceUrl) {
                            links.push(`<a href="${layer.sourceUrl}" target="_blank" class="hover:underline">Source</a>`);
                        }
                        if (layer.location) {
                            links.push(`<a href="#" class="hover:underline view-link" data-location="${layer.location}">View</a>`);
                        }

                        const $infoDiv = $('<div>', {
                            class: 'layer-info text-xs pl-5 text-gray-600',
                            html: links.join(' | ')
                        });

                        $infoDiv.find('.view-link').on('click', (e) => {
                            e.preventDefault();
                            this._flyToLocation(layer.location);
                        });

                        $infoDiv.insertAfter($label);
                    }
                }
            }
        });
    }

    async _flyToLocation(location) {
        try {
            const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(location)}.json?access_token=${mapboxgl.accessToken}&country=in`
            );
            const data = await response.json();

            if (data.features && data.features.length > 0) {
                const [lng, lat] = data.features[0].center;
                this._map.flyTo({
                    center: [lng, lat],
                    zoom: 12,
                    duration: 2000
                });
            }
        } catch (error) {
            console.error('Error flying to location:', error);
        }
    }

    _initializeWithAnimation() {
        const groupHeaders = this._container.querySelectorAll('.layer-group > .group-header input[type="checkbox"]');

        groupHeaders.forEach((checkbox, index) => {
            const group = this._options.groups[index];
            checkbox.checked = group?.initiallyChecked ?? false;
            checkbox.dispatchEvent(new Event('change'));
        });

        this._initialized = true;
    }

    onRemove() {
        this._animationTimeouts.forEach(timeout => clearTimeout(timeout));
        this._animationTimeouts = [];

        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
        window.removeEventListener('resize', () => this._handleResize());
    }

    _createPopupContent(feature, group, isHover = false, lngLat = null) {
        const content = document.createElement('div');
        content.className = 'map-popup p-4 font-sans';

        if (isHover) {
            if (group.inspect?.label) {
                const labelValue = feature.properties[group.inspect.label];
                if (labelValue) {
                    const labelDiv = document.createElement('div');
                    labelDiv.className = 'text-sm font-medium text-white';
                    labelDiv.textContent = labelValue;
                    content.appendChild(labelDiv);
                }
            }
            return content;
        }

        if (group.inspect?.title) {
            const title = document.createElement('h3');
            title.className = 'text-xs uppercase tracking-wider mb-3 text-gray-500 font-medium';
            title.textContent = group.inspect.title;
            content.appendChild(title);
        }

        const grid = document.createElement('div');
        grid.className = 'grid gap-4 mb-4';

        if (group.inspect?.label) {
            const labelValue = feature.properties[group.inspect.label];
            if (labelValue) {
                const labelDiv = document.createElement('div');
                labelDiv.className = 'text-2xl font-light mb-2';
                labelDiv.textContent = labelValue;
                grid.appendChild(labelDiv);
            }
        }

        if (group.inspect?.fields) {
            const fieldsGrid = document.createElement('div');
            fieldsGrid.className = 'grid grid-cols-2 gap-3 text-sm';

            group.inspect.fields.forEach((field, index) => {
                if (feature.properties.hasOwnProperty(field) && field !== group.inspect.label) {
                    const value = feature.properties[field];

                    const fieldContainer = document.createElement('div');
                    fieldContainer.className = 'col-span-2 grid grid-cols-2 gap-2 border-b border-gray-100 py-2';

                    const fieldLabel = document.createElement('div');
                    fieldLabel.className = 'text-gray-500 uppercase text-xs tracking-wider';
                    fieldLabel.textContent = group.inspect?.fieldTitles?.[index] || field;
                    fieldContainer.appendChild(fieldLabel);

                    const fieldValue = document.createElement('div');
                    fieldValue.className = 'font-medium text-xs text-right';
                    fieldValue.textContent = value;
                    fieldContainer.appendChild(fieldValue);

                    fieldsGrid.appendChild(fieldContainer);
                }
            });

            if (fieldsGrid.children.length > 0) {
                grid.appendChild(fieldsGrid);
            }
        }

        content.appendChild(grid);

        if (group.inspect?.customHtml) {
            const customContent = document.createElement('div');
            customContent.className = 'text-xs text-gray-600 pt-3 mt-3 border-t border-gray-200';
            customContent.innerHTML = group.inspect.customHtml;
            content.appendChild(customContent);
        }

        const lat = lngLat ? lngLat.lat : feature.geometry.coordinates[1];
        const lng = lngLat ? lngLat.lng : feature.geometry.coordinates[0];

        function convertToWebMercator(lng, lat) {
            const x = lng * 20037508.34 / 180;
            const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
            return {
                x: Math.round(x),
                y: Math.round(y * 20037508.34 / 180)
            };
        }

        const mercatorCoords = convertToWebMercator(lng, lat);
        const oneMapGoaLayerList = '&l=gp_police_station_a9c73118_2035_466c_9f5d_8888580816a0%21%2Cdma_garbage_treatment_plant_fc46bf4b_245c_4856_be7b_568b46a117c4%21%2Cdma_mrf_faciltiy_polygon_93c1ae1a_ea42_46c5_bbec_ed589e08d8c0%21%2Cdma_bio_methanation_plant_polygon_bdeb7c4d_17ec_4d9f_9e4a_3bf702905e1a%21%2Cdma_weighing_bridge_54e8be7c_e105_4098_a5fa_fb939eeba75e%21%2Cdma_mrf_faciltiy_95b4b5a3_a2ce_481b_9711_7f049ca1e244%21%2Cdma_incinerator_2d57ae07_9b3e_4168_ac8b_7f2187d5681a%21%2Cdma_ccp_biodigester_84960e2a_0ddf_465a_9bca_9bb35c4abcb4%21%2Cdma_bio_methanation_plant__f0edd163_cf6b_4084_9122_893ebc83d4fe%21%2Cdma_waste_management_sities_fa8b2c94_d4cd_4533_9c7e_8cf0d3b30b87%21%2Cdma_windrows_composting_shed_30ef18af_c8a7_45a9_befb_0b6c555bd263%21%2Cdgm_leases_f7677297_2e19_4d40_850f_0835388ecf18%21%2Cdgm_lease_names_fdb18573_adc9_4a60_9f1e_6c22c04d7871%21%2Cgdms_landslide_vulnerable_ced97822_2753_4958_9edc_7f221a6b52c9%21%2Cgdm_flooding_areas_1be469a8_af9d_46cf_953e_49256db7fe1d%21%2Cgsidc_sewerage_line_bddff132_f998_4be1_be43_b0fb71520499%21%2Cgsidc_sewerage_manhole_0654846e_5144_4d1f_977e_58d9c2c9a724%21%2Cged_division_boundary_04fe437b_405f_45fa_8357_02f0d564bdd4%21%2Cged_substation_4c686ea3_95a6_43e8_b136_e338a3a47e79%21%2Cged_rmu_2f2632f4_6ced_4eae_8ff8_6c2254697f13%21%2Cged_lv_wire_ca1f9541_7be0_4230_a760_a3b66507fc06%21%2Cged_lv_cable_9b8d0330_64e5_4bbf_bdb5_4927b39b2ef2%21%2Cged_hv_wire_a60bb861_6972_4f27_86a4_21492b59ede2%21%2Cged_hv_cable_54dae74c_08af_44f0_af49_ec3b5fcab581%21%2Cged_ehv_wire_68331f46_1c8f_4f85_99b0_151656c3b0c8%21%2Cged_ehv_cable_04580bfe_0d1c_4422_bec6_4093984ffa6d%21%2Cged_transformer_a967dbae_dbc2_487f_9fff_14865a65d8d6%21%2Cged_solar_generation_bbeed839_8737_421d_b5bc_277357dcd727%21%2Cged_towers_3c2b9c53_8aa0_4538_b969_731b66b98189%21%2Cged_protective_equipment_fa242976_c97c_4006_aeb1_8c32669f3477%21%2Cged_pole_240bac2f_8d3b_4989_bc0b_b34d9d78e018%21%2Cged_govt_connection__b89e0eff_2812_425e_aa29_4039e1489126%21%2Cged_cabinet_e3e83e28_cff8_4acc_855e_5572b21a8302%21%2Cgbbn_24F_150a4ba3_5e6e_4490_87cd_9a67a51f9a95%21%2Cgbbn_6F_7d67c332_14a0_433b_9036_d3edb7acfe1f%21%2Cgbbn_48F_87fa8495_0a7b_4a37_9154_5d749eb826e6%21%2Cgbbn_vgp_ce657914_2bc0_437a_b558_d614529d0d70%21%2Cgbbn_vgp1_da280706_4a39_4581_98f6_76a4a8258ee2%21%2Cgbbn_olt_afb08f2e_83de_4493_a04a_4eeee53cdabb%21%2Cgwrd_reservoirs_806646ae_e1d3_4b00_9afb_0659fea342cf%21%2Cgwrd_jackwell_casarwali_ad327886_70e4_4b98_bf5e_41da1e9240d0%21%2Cgwrd_pump_house_49ad2817_feb7_4bd4_beaa_2b8908823881%21%2Cgwrd_pumping_sub_station_219578a4_9fba_4c21_bfdf_6793c0e2ec9e%21%2Cgwrd_floodplains_0178162a_bedc_4875_bc74_c2eeba2a040b%21%2Cgwrd_floodembankments_6de30dc4_675b_4ef9_b204_cf2352c1fe9b%21%2Cgpwd_waterline_ffe24b0d_7e83_43e7_8d7f_e5bd2a0d49da%21%2Cgwrd_pipeline_82478411_6595_487b_b524_abb8931946a6%21%2Cgwrd_canal_c36fddaf_564b_43c5_ba74_86e46ca22995%21%2Cgwrd_end_of_pipeline_5518b446_8ff1_4d17_a28f_344dfa3e7901%21%2Cgwrd_tapping_point_401aac7c_77a1_47e2_8470_71a4880294a7%21%2Cgwrd_rain_guages___flood_monitors_ae6547a5_6eca_4932_a1c8_f80c8e04551b%21%2Cgsa_goa_sports_complex_3e450e4c_9a69_4cf7_94ac_2c9082e5388a%21%2Cgie_verna_industrial_estate_81926f17_e182_42a7_9614_0160bf19fa34%21%2Cgie_quittol_industrial_estate_5d5aadba_071c_432d_b424_6c3644c29338%21%2Cgie_latambarcem_industrail_estate_919dd4d4_d8ae_44cc_aff0_bd27fbe1e0a3%21%2Cgcsca_fps_godowns_a3b498e8_fda8_4249_b17b_8c0acbb444d7%21%2Cgcsca_fps_shops_debfb1ee_0fb9_4cfe_95a7_8d9880d22deb%21%2Cgargi_seed_farm_519a1d9c_7a62_4906_a44c_7f7a6d8744b4%21%2Cdfg_ramps_8fb28e3c_4344_409b_9e47_b19c1b8c5fe0%21%2Cdfg_jetty_6a70f09c_fc73_4c48_be61_c35b9f2a7094%21%2Cdfg_fish_landing_centers_b5f571c3_5a64_4ae9_8413_289a912e2f37%21%2Cdfg_aqua_culture_005788c0_d630_42c1_a61f_178234cc61f4%21%2Cdah_cattle_feed_factory_d4f517d5_db91_493c_8b8c_d3cb1062d369%21%2Cdah_egg_production_ff7dac52_5c84_4f17_96eb_2621f7ed01c4%21%2Cdah_veterinary_centres_b9b0b3ac_35e7_4973_a175_f515fbc0efd5%21%2Cdah_sumul_dairy_a0d775d5_8048_4858_869b_3083b34c0bcf%21%2Cdah_production_cattle_244945b5_f092_4644_a585_1601ce097c6c%21%2Cdah_milk_production_70534439_ebaa_4c88_bbb9_f44cae179078%21%2Cdah_milk_processing_unit_8d3ff9f8_387c_4d52_b5a5_ad0ab020fc10%21%2Cdah_farms_e208fb45_f1d4_4489_ae7b_753fc32d4b07%21%2Cgagri_landform_1b36389a_a5c2_4307_8515_beb0e49ceef6%21%2Cdslr_goa_villages_c9939cd5_f3c8_4e94_8125_38adb10e6f45%2Cdaa_asi_sites_9b100a72_f84f_4114_b81f_42f5e46334b1%21%2Ctdc_gurudwara_e1ff2fde_1fbd_41aa_b1af_0f844ebdbee8%21%2Ctdc_mosque_05493477_4f6f_4973_8edc_ae8d6e1dc2ef%21%2Ctdc_church_ca9f3144_cca2_402a_bb7c_85126a42a69b%21%2Ctdc_temple_33d6e141_2ae9_4a43_909a_f252ef6f27d6%21%2Cgfd_range_ac0c898d_b912_43e5_8641_cc8d558b96c2%21%2Cgfd_wls_29b8d326_2d60_4bde_b743_6a239516c86c%21%2Cgfd_eco_sensitive_zone_451208a2_46f8_45aa_ba54_a5e5278aa824%21%2Cdhs_institute_63eb16bc_7d5c_4804_b7c3_99b9481eae1d%21%2Cdhs_hospital_c90b25e4_f64d_49f5_8696_410dfe8b18bd%21%2Cdhs_uhc_882ec1f1_633e_4411_b223_c0fe874575b2%21%2Cdhs_phc_771cb209_c40a_4786_ab15_122f5b8caf7f%21%2Cdhs_chc_43f53098_e034_404f_a7c4_bbc949038e5a%21%2Cdhs_ayurvedic___homeopathic_dispensaries_339b4c62_c1a7_4b6b_b8c6_272ec8a7e46a%21%2Cdhs_hsc_0e3ffe3f_21f5_4201_8596_d6b37a1d8f10%21%2Cdot_bus_stop_9a5e21ba_b562_45bc_a372_dfe71301af16%21%2Cgkr_railway_line_943f6fe0_5c1d_461e_bf1f_e914b2991191%21%2Cdot_rto_checkpost__af7f50e9_7412_4658_a40a_5d88d303d3ab%21%2Cdot_traffic_signal_b29280ac_53eb_4207_b713_5d965dd36f5c%21%2Cdot_depot_c46b1f5c_d838_4bab_bac3_6f9eb54bd7e5%21%2Cgkr_railway_station_eeffd0d6_ac46_4f69_a6b3_952cf2687ea2%21%2Cktc_bus_stops_1272f729_fbe6_49fb_9873_5d2d6fb2f99d%21%2Cgdte_schools_a53455c4_c969_4bc6_af70_e0403df19623%21%2Cdtw_ashram_school_8e3e826e_8cc5_4ebb_b7b6_e159a591143d%21%2Cgdte_iti_college_5c51844a_d03d_4745_9a27_dfc44351d160%21%2Cgdte_government_institute_976db146_84af_4c70_80cf_625726d858bf%21%2Cgdte_college_26d0511b_5a9d_4c94_983a_4d99d24ee293%21%2Cgoa_villages_f7a04d50_013c_4d33_b3f0_45e1cd5ed8fc%2Cgoa_taluka_boundary_9e52e7ed_a0ef_4390_b5dc_64ab281214f5%2Cgoa_district_boundary_81d4650d_4cdd_42c3_bd42_03a4a958b5dd%2Cgoa_boundary_ae71ccc6_6c5c_423a_b4fb_42f925d7ddc0';

        const navigationLinks = [
            {
                name: 'OSM',
                url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}&layers=D`,
                icon: 'https://upload.wikimedia.org/wikipedia/commons/b/b0/Openstreetmap_logo.svg'
            },
            {
                name: 'Google Maps',
                url: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
                icon: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Google_Maps_icon_%282020%29.svg'
            },
            {
                name: 'Bhuvan',
                url: `https://bhuvanmaps.nrsc.gov.in/?mode=Hybrid#18/${lat}/${lng}`,
                icon: 'https://bhuvan.nrsc.gov.in/home/images/bhuvanlite.png'
            },
            {
                name: 'One Map Goa',
                url: `https://onemapgoagis.goa.gov.in/map/?ct=LayerTree${oneMapGoaLayerList}&bl=mmi_hybrid&t=goa_default&c=${mercatorCoords.x}%2C${mercatorCoords.y}&s=500`,
                icon: 'https://onemapgoagis.goa.gov.in/static/images/oneMapGoaLogo1mb.gif'
            },
            {
                name: 'Landcover',
                url: `https://livingatlas.arcgis.com/landcoverexplorer/#mapCenter=${lng}%2C${lat}%2C18.79&mode=step&timeExtent=2017%2C2023&year=2023`,
                text: 'LC'
            },
            {
                name: 'Timelapse',
                url: `https://earthengine.google.com/timelapse#v=${lat},${lng},15,latLng&t=0.41&ps=50&bt=19840101&et=20221231`,
                text: 'TL'
            }
        ];

        let linksHTML = navigationLinks.map(link =>
            `<a href="${link.url}" target="_blank" class="flex items-center gap-1 hover:text-gray-900">
                ${link.icon ? `<img src="${link.icon}" class="w-5 h-5" alt="${link.name}">` : ''}
                ${link.text ? `<span class="text-xs text-gray-600">${link.text}</span>` : ''}
            </a>`
        ).join('');
        linksHTML = `<div class="text-xs text-gray-600 pt-3 mt-3 border-t border-gray-200 flex gap-3">${linksHTML}</div>`;
        content.innerHTML += linksHTML;

        return content;
    }

    _getInsertPosition(type, groupIndex) {
        const layers = this._map.getStyle().layers;
        const baseLayerIndex = layers.findIndex(layer =>
            layer.type === 'raster' && layer.id.includes('satellite')
        );

        let insertIndex;
        if (type === 'vector') {
            return undefined;
        }

        if (type === 'tms' || type === 'osm' || type === 'raster') {
            if (baseLayerIndex !== -1 && baseLayerIndex + 1 < layers.length) {
                const insertBeforeId = layers[baseLayerIndex + 1].id;

                return insertBeforeId;
            }
        }

        return undefined;
    }

    _getVisibleLayers() {
        return this._options.groups.flatMap(group => {
            const isLayerVisible = (id) =>
                this._map.getLayer(id) &&
                this._map.getLayoutProperty(id, 'visibility') === 'visible';

            switch (group.type) {
                case 'vector':
                    const vectorId = `vector-layer-${group.id}`;
                    return isLayerVisible(vectorId) ? [vectorId] : [];

                case 'geojson':
                    const baseId = `geojson-${group.id}`;
                    return ['fill', 'line', 'label']
                        .map(type => `${baseId}-${type}`)
                        .filter(isLayerVisible);

                case 'tms':
                    const tmsId = `tms-layer-${group.id}`;
                    return isLayerVisible(tmsId) ? [tmsId] : [];

                default:
                    return (group.layers || [])
                        .map(layer => layer.id)
                        .filter(isLayerVisible);
            }
        });
    }
}

function gstableToArray(tableData) {
    const { cols, rows } = tableData;
    const headers = cols.map(col => col.label);
    const result = rows.map(row => {
        const obj = {};
        row.c.forEach((cell, index) => {
            const key = headers[index];
            // Check if this is a timestamp column and has a value
            obj[key] = cell ? cell.v : null;
            if (cell && cell.v && key.toLowerCase().includes('timestamp')) {
                let timestamp = new Date(...cell.v.match(/\d+/g).map((v, i) => i === 1 ? +v - 1 : +v));
                timestamp = timestamp.setMonth(timestamp.getMonth() + 1)
                const now = new Date();
                const diffTime = Math.abs(now - timestamp);
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                // Create a human-readable "days ago" string
                let daysAgoText;
                if (diffDays === 0) {
                    daysAgoText = 'Today';
                } else if (diffDays === 1) {
                    daysAgoText = 'Yesterday';
                } else {
                    daysAgoText = `${diffDays} days ago`;
                }
                // Add the days ago text as a new field
                obj[`${key}_ago`] = daysAgoText;
            }
        });
        return obj;
    });
    return result;
}

window.MapLayerControl = MapLayerControl; 