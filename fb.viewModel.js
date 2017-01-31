/** @module FormsBuilder.ViewModel */
/**
 *
 * Modulo que carga el modelo de datos desde el XML
 *
 * (c) SAT 2013, Iv�n Gonz�lez
 */
/*global namespace:false, FormsBuilder:false, SAT: false, AppDeclaracionesSAT:false, ko:false, Base64:false */

"use strict";

(function() {
    namespace("FormsBuilder.ViewModel", get, getDetalleCheckbox, getDetalle, getDetalleGrid, getDetalleFK, init,
        applyDataBindings, createXml, getFieldsForExprs, getFieldsForExprsGrid, getFlujoSecciones, applyRule,
        applyRuleGrid, Validacion, Calculo, Visual, ValidacionGrid, CalculoGrid, VisualGrid, DeshabilitarCalculoGrid,
        procesarMensajeError, procesarMensajeErrorGrid, getConfiguracionFisicas, applyRulesDejarSinEfecto, bindRegresa,
        getLenQueueRules, getEntitiesXml, applyRuleGridAgregar, setBadgeCount, bindGuardar, bindEnviaDeclara, bindPresenta);
    window.fbViewModel = FormsBuilder.ViewModel;

    var PREFIJO_GRID = "grid";
    var RULES_RULE = 'reglas';
    var FN_SUMAGRID = "SUMAGRID";
    var MODO_AL_AGREGAR = 1;
    var REGLA_EJECUTAR_SIEMPRE = 0;
    var REGLA_EJECUTAR_POSTERIOR = 1;

    var viewModel = {};
    var viewModelGrid = {};
    var viewModelDetalle = {};

    var viewModelCheckboxList = {};
    var viewModelDetalleForeignKeys = {};

    var configuracionFisicas = {
        subRegimenes: '',
        areaGeografica: ''
    };

    var flujoSecciones = {};
    var fieldsForExprs = {};
    var fieldsForExprsGrid = {};
    var reglas;

    var removeFuncs = [];
    var applyRulesFuncs = [];

    var rulesCacheGrid = [];
    var rulesCache = [];

    var prefixFieldExpr = '$';


    function get() {
        return viewModel;
    }

    function getDetalle() {
        return viewModelDetalle;
    }

    function getDetalleGrid() {
        return viewModelGrid;
    }

    function getDetalleCheckbox() {
        return viewModelCheckboxList;
    }

    function getDetalleFK() {
        return viewModelDetalleForeignKeys;
    }

    function getFieldsForExprs() {
        return fieldsForExprs;
    }

    function getFieldsForExprsGrid() {
        return fieldsForExprsGrid;
    }

    function getFlujoSecciones() {
        return flujoSecciones;
    }

    function getConfiguracionFisicas() {
        return configuracionFisicas;
    }

    function getLenQueueRules() {
        return applyRulesFuncs.length;
    }

    function init(entidadesModel, cb) {
        //reglas = $(FormsBuilder.XMLForm.getCopy()).find('reglas');
        //var entidades = $(xmlDoc).find('modeloDatos > entidades > entidad');

        console.log(">>>> Inicia 'ViewModel.init'");

        $.each(entidadesModel, function(keyEntidad, valueEntidad) {
            //var propiedades = $(valueEntidad).children('propiedades').children('propiedad');

            viewModel[valueEntidad.id] = {};
            if (valueEntidad.propiedades != null && valueEntidad.propiedades.propiedad != undefined) {
                $.each(valueEntidad.propiedades.propiedad, function(keyPropiedad, valuePropiedad) {

                    var idEntidad = valueEntidad.id;
                    var idPropiedad = valuePropiedad.id;
                    var claveInformativa = valuePropiedad.claveInformativa;

                    fieldsForExprs[prefixFieldExpr + idPropiedad] = {
                        entidad: idEntidad,
                        propiedad: idPropiedad,
                        tipoDatos: valuePropiedad.tipoDatos
                    };
                    window[prefixFieldExpr + idPropiedad] = 0;

                    var db_id = "E{0}P{1}".format(idEntidad, idPropiedad);
                    if (!viewModel[idEntidad].hasOwnProperty(db_id)) {
                        viewModel[idEntidad][db_id] = ko.observable('');

                        viewModel[valueEntidad.id][db_id].subscribe(function(newValue) {
                            if (isDateEmpty(newValue)) {
                                return;
                            }

                            SAT.Environment.setSetting('isModified', true);

                            var aplicaRegla = true;
                            if (SAT.Environment.settings('applyrules')) {
                                var indexEntidad = fbUtils.getEntidad(db_id);
                                if (FormsBuilder.ViewModel.getFlujoSecciones()[indexEntidad] !== undefined) {
                                    if (FormsBuilder.ViewModel.getFlujoSecciones()[indexEntidad]['NoAplica'] !== undefined) {
                                        if (FormsBuilder.ViewModel.getFlujoSecciones()[indexEntidad]['NoAplica'] === "true") {
                                            aplicaRegla = false;
                                        }
                                    }
                                }

                                var propiedadesReglas = FormsBuilder.XMLForm.getReglas();
                                if (propiedadesReglas.propiedades && propiedadesReglas.propiedades.propiedad) {
                                    var propiedadControl = fbUtils.getPropiedad(db_id);

                                    aplicaRegla = Enumerable.From(propiedadesReglas.propiedades.propiedad).Any("$.ejecutarRegla == '1' && $.idPropiedad == '{0}'".format(propiedadControl));
                                }

                                if (aplicaRegla) {
                                    var applyRuleFunc;
                                    if (SAT.Environment.settings('dejarsinefecto') === false) {
                                        applyRuleFunc = function() {
                                            applyRule(db_id, newValue, REGLA_EJECUTAR_SIEMPRE);
                                            applyValueSettingByProp(db_id, newValue);
                                            applyDetailsRules(db_id, newValue);
                                        };
                                    } else {
                                        applyRuleFunc = function() {
                                            applyRulesDejarSinEfecto(db_id, claveInformativa, true);
                                        };
                                    }

                                    if (applyRuleFunc) {
                                        applyRulesFuncs.push(applyRuleFunc);
                                    }

                                    setTimeout(function() {
                                        if (applyRulesFuncs.length) {
                                            var func = applyRulesFuncs.shift();
                                            func.call();
                                        }
                                    }, 1);
                                }
                            }
                        });
                    }
                });
            }
        });
        console.log("Modelo Cargado");

        if (cb && typeof cb === "function") {
            cb();
        }
    }

    function applyDetailsRules(db_id, newValue) {
        if (viewModelDetalleForeignKeys[db_id] !== undefined) {
            if (newValue === 0 || newValue === '') {
                var dlg = $('[sat-dlg-dbid="{0}"] div:first'.format(db_id));
                var trItem = dlg.find('table tr[item]');
                if (trItem.length > 0) {
                    trItem.remove();
                }

                var rowCompensaciones = $('[sat-dlg-compensaciones-dbid="{0}"] div:first'.format(db_id)).find('.sat-row-compensaciones');
                if (rowCompensaciones.length > 0) {
                    rowCompensaciones.remove();
                }
                viewModelDetalle[viewModelDetalleForeignKeys[db_id]] = [];
            }
        }
    }

    function applyValueSettingByProp(db_id, newValue) {
        var total = 0;

        if (FormsBuilder.Parser.getDataProp() !== undefined) {
            var needsToApplySetting = $.inArray(db_id, FormsBuilder.Parser.getDataProp());
            if (needsToApplySetting >= 0) {
                FormsBuilder.Parser.getDataProp()[db_id] = newValue;

                $.each(FormsBuilder.Parser.getDataProp(), function(k, v) {
                    var val = FormsBuilder.Parser.getDataProp()[v];
                    if (!IsNullOrEmpty(val)) {
                        var value = parseInt(val);

                        if (!isNaN(value)) {
                            total += value;
                        }
                    }
                });

                var control = $('[field-bind="{0}"]'.format(db_id));
                if (!IsNullOrEmptyWhite(newValue)) {
                    control.html("$" + newValue);
                    fbUtils.applyFormatCurrencyOnElement(control, true);
                    var controlValue = "${0}".format(control.text());
                    control.html(controlValue);
                } else {
                    control.html('');
                }

                var totalPay = $('.topay > span:last');
                totalPay.html("${0}".format(total));
                fbUtils.applyFormatCurrencyOnElement(totalPay, true);
                var totalPayValue = "${0}".format(totalPay.text());
                totalPay.html(totalPayValue);

                //TODO: Poner $24007 en un archivo o setting configuracion
                var infoField = FormsBuilder.ViewModel.getFieldsForExprs()["$24007"];
                var db_id2 = "E{0}P{1}".format(infoField.entidad, infoField.propiedad);
                viewModel[infoField.entidad][db_id2](total);
            }
        }
    }

    function containGroupOperation(reglaEntidad) {
        var exprs = reglaEntidad.definicion.match(/SUMA[(](.*?)[)]/igm) ||
            reglaEntidad.definicion.match(/DUPLICADO[(][$](\w+|[0-9^_]+)[)]/igm);
        if ($.isArray(exprs)) {
            return exprs.length > 0;
        }
        return false;
    }

    function getInfoOperations(operations) {
        var result = [];
        if ($.isArray(operations)) {
            $(operations).each(function(index, value) {
                var operationEntidad = {};
                var nombreOperation = value.match(/^(.*?)(?=[(])/igm);
                if (nombreOperation && nombreOperation.length > 0) {
                    operationEntidad.nombre = nombreOperation[0];
                }
                value = value.replace(/(.*?)[(]/igm, "");
                value = value.replace(/[)]$/igm, "");
                var parameters = value.split(",");
                operationEntidad.parametros = [];
                if (parameters && parameters.length > 0) {
                    operationEntidad.parametros = parameters;
                }

                if (operationEntidad.hasOwnProperty("nombre")) {
                    result.push(operationEntidad);
                }
            });
        }
        return result;
    }

    function getGroupOperations(definicion) {
        var groupOperations = definicion.match(/SUMA[(](.*?)[)]/igm) ||
            definicion.match(/DUPLICADO[(][$](\w+|[0-9^_]+)[)]/igm);

        return getInfoOperations(groupOperations);
    }

    function getImplicitRules(reglaEntidad, dbId) {
        var result = [];
        var reglas = FormsBuilder.XMLForm.getReglas();
        var regla = Enumerable.From(reglas.reglas.regla).Where("$.id === '{0}'".format(reglaEntidad.idRegla)).FirstOrDefault();
        //$(reglas).find('regla[id="{0}"]'.format(reglaEntidad.idRegla));
        var operations = getGroupOperations(reglaEntidad.definicion);
        var idPropiedad = fbUtils.getPropiedad(dbId);
        var idEntidad = fbUtils.getEntidad(dbId);
        var detalleGrid = FormsBuilder.ViewModel.getDetalleGrid();

        for (var index in operations) {
            var operation = operations[index];
            var hasParameters = operation.parametros.length > 0;
            if (hasParameters) {
                var lastIndex = operation.parametros.length - 1;
                var lastParameter = operation.parametros[lastIndex];
                //TODO: Para lanzar validaciones de los hermanos en controlesgrid
                // if (lastParameter === "${0}".format(idPropiedad)) {
                var grid = detalleGrid[idEntidad];
                for (var indexRow in grid) {
                    nextRow: for (var viewModelId in grid[indexRow]) {
                        var counter = viewModelId.split('_')[1];
                        var newDbId = "E{0}P{1}_{2}".format(idEntidad, idPropiedad, counter);
                        if (newDbId !== dbId) {
                            result.push({
                                regla: regla,
                                dbId: newDbId
                            });
                        }
                        break nextRow;
                    }

                }
                // }
            }

        }
        return result;
    }

    function applyRuleGrid(db_id, newValue, callback, isFormGridEdicion) {

        console.log(">>>> Inicia 'ViewModel.applyRuleGrid'");

        var idEntidad = fbUtils.getEntidad(db_id);
        var detalleGrid = FormsBuilder.ViewModel.getDetalleGrid();
        var reglas = FormsBuilder.XMLForm.getReglas();

        if (detalleGrid[idEntidad] !== undefined) {
            var db_id_grid = db_id.split('_')[0];
            var reglasEntidadGrid = FormsBuilder.Runtime.getRules()[db_id_grid];
            if (reglasEntidadGrid === undefined)
                return;

            $.each(reglasEntidadGrid, function(k, reglaEntidad) {
                var regla;

                if (rulesCacheGrid[reglaEntidad.idRegla] === undefined) {
                    regla = Enumerable.From(reglas.reglas.regla).Where("$.id == '{0}'".format(reglaEntidad.idRegla)).FirstOrDefault();
                    //$(reglas).find('regla[id="{0}"]'.format(reglaEntidad.idRegla));
                    rulesCacheGrid[reglaEntidad.idRegla] = regla;
                } else {
                    regla = rulesCacheGrid[reglaEntidad.idRegla];
                }

                if (regla.definicion !== undefined) {
                    var isNotRunRule = (regla.tipoRegla === 'Calculo' ||
                            regla.tipoRegla === 'Condicional Excluyente' ||
                            regla.tipoRegla === 'Validacion') &&
                        isFormGridEdicion &&
                        SAT.Environment.settings('isHydrate') === true &&
                        AppDeclaracionesSAT.getConfig('esSelector') === false;

                    if (SAT.Environment.settings('isDAS')) {
                        var isRunRuleDAS = (regla.tipoRegla === 'Calculo' ||
                                regla.tipoRegla === 'Condicional Excluyente') &&
                            isFormGridEdicion &&
                            AppDeclaracionesSAT.getConfig('forma') === 'new';
                    } else {
                        var isRunRuleFisicas = (regla.tipoRegla === 'Calculo' ||
                                regla.tipoRegla === 'Condicional Excluyente') &&
                            isFormGridEdicion &&
                            AppDeclaracionesSAT.getConfig('forma') === 'new';
                    }

                    if (typeof isRunRuleDAS !== 'undefined') {
                        if (isNotRunRule && !isRunRuleDAS) return;
                    } else {
                        if (isNotRunRule && !isRunRuleFisicas) return;
                    }

                    if (SAT.Environment.settings('isDAS')) {
                        if (isFormGridEdicion && regla.tipoRegla === 'Calculo' && regla.ejecutarEnGridEdicion !== '1') {
                            if (SAT.Environment.settings('runRulesCalc') == false && SAT.Environment.settings('isHydrate') === false) {
                                FormsBuilder.Modules.addRuleGridEdicion(db_id, newValue, callback, isFormGridEdicion);
                                return;
                            }
                        }
                    }

                    if (SAT.Environment.settings('actualizacionimporte') === true) {
                        if (regla.tipoRegla === 'Visual' &&
                            regla.definicion.trimAll().match(/[^IN]HABILITAR[(][$](\w+|[0-9^_]+)[)]/igm)) {
                            return;
                        }
                    }

                    reglaEntidad.definicion = regla.definicion.trimAll();
                    reglaEntidad.mensajeError = regla.mensajeError;
                    reglaEntidad.idPropiedadAsociada = regla.idPropiedadAsociada;

                    var rules = [];
                    rules.push({
                        regla: regla,
                        dbId: db_id
                    });
                    if (containGroupOperation(reglaEntidad)) {
                        var siblingRules = getImplicitRules(reglaEntidad, db_id);

                        var sumaFind = reglaEntidad.definicion.match(/SUMA[(](.*?)[)]/igm);
                        if (sumaFind && sumaFind[0].indexOf(',') === -1) {
                            rules = rules.concat(siblingRules);
                        } else if (reglaEntidad.definicion.match(/DUPLICADO/)) {
                            rules = rules.concat(siblingRules);
                        }
                    }

                    $.each(rules, function(index, item) {
                        switch (item.regla.tipoRegla) {
                            case 'Validacion':
                                if (SAT.Environment.settings('applyrulesvalidation') === true) {
                                    ValidacionGrid(item.dbId, item.regla);
                                }
                                break;
                            case 'Calculo':
                            case 'Condicional Excluyente':
                                if ((SAT.Environment.settings('isHydrate') === true &&
                                        regla.ejecutarSiempre !== '1') && AppDeclaracionesSAT.getConfig('forma') !== 'new')
                                    break;

                                CalculoGrid(item.dbId, item.regla);
                                break;
                            case 'Visual':
                                VisualGrid(item.dbId, item.regla);
                                break;
                        }
                    });
                } else {
                    // console.log('Se detecto un launcher sin regla con el ID {0}'.format(reglaEntidad.idRegla));
                }
            });
        }

        if (callback !== undefined) {
            callback();
        }
    }

    function applyRuleGridAgregar(db_id) {
        var idEntidad = fbUtils.getEntidad(db_id);
        var detalleGrid = FormsBuilder.ViewModel.getDetalleGrid()[idEntidad];
        var reglas = FormsBuilder.XMLForm.getReglas();

        if (detalleGrid) {
            var reglasAlAgregar = Enumerable.From(reglas.reglas.regla).Where("$.modoejecucion == '{0}'".format(MODO_AL_AGREGAR)).ToArray();
            if (reglasAlAgregar) {
                $.each(reglasAlAgregar, function(k, reglaEntidad) {
                    if (!rulesCacheGrid[reglaEntidad.idRegla]) {
                        rulesCacheGrid[reglaEntidad.idRegla] = reglaEntidad;
                    }

                    if (reglaEntidad.definicion) {}
                });
            }

            if (callback !== undefined) {
                callback();
            }
        }
    }

    function VisualGrid(db_id, regla) {
        if (AppDeclaracionesSAT.getConfig('esSelector') && SAT.Environment.settings('isDAS')) {
            if (regla.ejecutarEnSelector !== '1') {
                return;
            }
        }

        var idEntidad = fbUtils.getEntidad(db_id);
        var detalleGrid = FormsBuilder.ViewModel.getDetalleGrid();
        var result;
        var counter;
        var reglaEntidad = {};

        reglaEntidad.definicion = regla.definicion;
        reglaEntidad.definicion = reglaEntidad.definicion.trimAll();
        reglaEntidad.mensajeError = regla.mensajeError;
        reglaEntidad.idPropiedadAsociada = regla.idPropiedadAsociada;
        reglaEntidad.idRegla = regla.attrid;
        //var xmlCopy = FormsBuilder.XMLForm.getCopy();
        var propiedadesReglas = FormsBuilder.XMLForm.getReglas()["propiedades"];
        //var symbolsXml = xmlCopy.find('definicionReglas > propiedades > propiedad[idRegla="{0}"]'.format(regla.id));
        var symbols = Enumerable.From(propiedadesReglas.propiedad).Where("$.idRegla == '{0}'".format(regla.id)).Select("$.idPropiedad").ToArray();
        // $.each(symbolsXml, function (k, sym) {
        //     symbols.push('$' + sym.idPropiedad);
        // });
        symbols.push(reglaEntidad.definicion.split("=")[0]);

        for (var symbol in symbols) {
            for (var i = 0; i < detalleGrid[idEntidad].length; i++) {
                for (var detalleItem in detalleGrid[idEntidad][i]) {
                    var id = detalleItem.substring(detalleItem.indexOf('P') + 1, detalleItem.length);

                    var symbolDetalle = '$' + id;
                    counter = id.split('_')[1];

                    if (counter === db_id.split('_')[1]) {
                        if (symbolDetalle === symbols[symbol] + '_' + counter) {
                            var searchSymbols = reglaEntidad.definicion.match('[$]{0}'.format(id.split('_')[0]));
                            if (searchSymbols !== null) {
                                $.each(searchSymbols, function(k, searchSymbol) {
                                    var matchSymbol = new RegExp("\\" + searchSymbol + "(?!([A-Z\d]|(_[0-9]*))+)|" + "\\" + searchSymbol + "((_[0-9]*)+)", "igm");
                                    reglaEntidad.definicion = reglaEntidad.definicion.replace(matchSymbol, function() {
                                        return searchSymbol + '_' + counter;
                                    });
                                    return false;
                                });
                            }
                        }
                    }
                }
            }
        }

        try {
            var exprs = reglaEntidad.definicion.match(/ESNULO[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprsGrid(exprs, reglaEntidad);

            if (reglaEntidad.definicion.match(/CONTADORCONDICIONAL[(](.*)[)]/igm) === null) {
                exprs = reglaEntidad.definicion.match(/ELEMENTOSGRID[(][$](\w+|[0-9^_]+)[)]/igm);
                modifiyExprs(exprs, reglaEntidad);
            }

            exprs = reglaEntidad.definicion.match(/INHABILITAR[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprsGrid(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/OCULTAR[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprsGrid(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/MOSTRAR[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprsGrid(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/[^IN]HABILITAR[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprsGrid(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/ESENTEROPOSITIVO[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprsGrid(exprs, reglaEntidad);

            FormsBuilder.Runtime.evaluateGrid(reglaEntidad.definicion);
            if (AppDeclaracionesSAT.getConfig('view-rules')) {
                console.log("Resultado N/A -:- Tipo [VisualGrid] -:- RuleId {0}-:- Regla {1}".format(reglaEntidad.idRegla, reglaEntidad.definicion));
            }
        } catch (err) {
            if (AppDeclaracionesSAT.getConfig('debug')) {
                console.log("Mensaje de error {0} -:- Regla {1}".format(err.message, reglaEntidad.definicion));
            }
        }
    }

    function modifiyExprsGrid(exprs, reglaEntidad) {
        if (exprs !== null) {
            $.each(exprs, function(k, expr) {
                reglaEntidad.definicion = reglaEntidad.definicion.replace(expr, expr.replace("(", 'GRID("').replace(")", '")'));
            });
        }
    }

    function ValidacionGrid(db_id, regla) {
        if (AppDeclaracionesSAT.getConfig('esSelector') && SAT.Environment.settings('isDAS')) {
            if (regla.ejecutarEnSelector !== '1') {
                return;
            }
        }

        var propiedades = FormsBuilder.XMLForm.getReglas()["propiedades"];
        var idEntidad = fbUtils.getEntidad(db_id);
        var detalleGrid = FormsBuilder.ViewModel.getDetalleGrid();
        var result;
        var counter;
        var counterSearch;
        var reglaEntidad = {};
        reglaEntidad.definicion = regla.definicion;
        reglaEntidad.definicion = reglaEntidad.definicion.trimAll();
        reglaEntidad.mensajeError = regla.mensajeError;
        reglaEntidad.idPropiedadAsociada = regla.idPropiedadAsociada;
        reglaEntidad.idRegla = regla.id;
        //var xmlCopy = FormsBuilder.XMLForm.getCopy();

        if (SAT.Environment.settings('applyrulesvalidation')) {
            //var symbolsXml = Enumerable.From(propiedades.propiedad).Where("$.idRegla == '{0}'".format(regla.id)).ToArray();
            //xmlCopy.find('definicionReglas > propiedades > propiedad[idRegla="{0}"]'.format(regla.id));

            var symbols = Enumerable.From(propiedades.propiedad).Where("$.idRegla == '{0}'".format(regla.id)).Select("$.idPropiedad").ToArray();
            // $.each(symbolsXml, function (k, sym) {
            //     symbols.push('$' + $(sym).attr('idPropiedad'));
            // });

            for (var symbol in symbols) {
                for (var i = 0; i < detalleGrid[idEntidad].length; i++) {
                    for (var detalleItem in detalleGrid[idEntidad][i]) {
                        var id = detalleItem.substring(detalleItem.indexOf('P') + 1, detalleItem.length);
                        var symbolDetalle = '$' + id;
                        counter = id.split('_')[1];

                        if (counter === db_id.split('_')[1]) {
                            counterSearch = counter;
                            if (symbolDetalle === symbols[symbol] + '_' + counter) {
                                var searchSymbols = reglaEntidad.definicion.match('[$]{0}'.format(id.split('_')[0]));
                                if (searchSymbols !== null) {
                                    $.each(searchSymbols, function(k, searchSymbol) {
                                        var matchSymbol = new RegExp("\\" + searchSymbol + "(?!([A-Z\d]|(_[0-9]*))+)|" + "\\" + searchSymbol + "((_[0-9]*)+)", "igm");
                                        reglaEntidad.definicion = reglaEntidad.definicion.replace(matchSymbol, function() {
                                            return searchSymbol + '_' + counter;
                                        });
                                        return false;
                                    });
                                }
                            }
                        }
                    }
                }
            }

            try {
                var exprs;
                if (reglaEntidad.definicion.match(/CONTADORCONDICIONAL[(](.*)[)]/igm) === null) {
                    exprs = reglaEntidad.definicion.match(/ESNULOGRID[(][$](\w+|[0-9^_]+)[)]/igm);
                    modifiyExprs(exprs, reglaEntidad);

                    exprs = reglaEntidad.definicion.match(/ELEMENTOSGRID[(][$](\w+|[0-9^_]+)[)]/igm);
                    modifiyExprs(exprs, reglaEntidad);

                    exprs = reglaEntidad.definicion.match(/VALORANTERIOR[(][$](\w+|[0-9^_]+)[)]/igm);
                    modifiyExprs(exprs, reglaEntidad);
                }

                exprs = reglaEntidad.definicion.match(/ESNULO[(][$](\w+|[0-9^_]+)[)]/igm);
                modifiyExprs(exprs, reglaEntidad);

                exprs = reglaEntidad.definicion.match(/DUPLICADO[(][$](\w+|[0-9^_]+)[)]/igm);
                modifiyExprs(exprs, reglaEntidad);

                exprs = reglaEntidad.definicion.match(/SUMACONDICIONAL[(](.*?)[)]/igm);
                modifiyExprsMultiple(exprs, reglaEntidad);

                exprs = reglaEntidad.definicion.match(/ESENTEROPOSITIVO[(][$](\w+|[0-9^_]+)[)]/igm);
                modifiyExprsGrid(exprs, reglaEntidad);

                exprs = reglaEntidad.definicion.match(/SUMA[(](.*?)[)]/igm);
                if (exprs !== null) {
                    $.each(exprs, function(k, expr) {
                        if (expr.indexOf(',') === -1) {
                            var exprsSuma = expr.match(/[_][0-9]+/);
                            if (exprsSuma !== null) {
                                $.each(exprsSuma, function(k, exprSuma) {
                                    reglaEntidad.definicion = reglaEntidad.definicion.replace(expr, expr.replace(exprSuma, ''));
                                    expr = expr.replace(exprSuma, '');
                                });
                            }
                        }
                        reglaEntidad.definicion = reglaEntidad.definicion.replace(expr, expr.replace("(", '("').replace(")", '")'));
                    });
                }
                exprs = reglaEntidad.definicion.match(/SUMAGRID[(](.*?)[)]/igm);
                modifiyExprs(exprs, reglaEntidad);

                reglaEntidad.mensajeError = procesarMensajeErrorGrid(reglaEntidad.mensajeError, db_id.split('_')[1]);

                result = FormsBuilder.Runtime.evaluateGrid(reglaEntidad.definicion);
                var resultado = [reglaEntidad.tipo, result];

                if (AppDeclaracionesSAT.getConfig('view-rules')) {
                    console.log("Resultado {0} -:- Tipo [ValidacionGrid] -:- RuleId {1}-:- Regla {2}".format(result, reglaEntidad.idRegla, reglaEntidad.definicion));
                }

                var rl = FormsBuilder.ViewModel.getFieldsForExprsGrid()['$' + reglaEntidad.idPropiedadAsociada + '_' + counterSearch];
                var db_id2 = "E{0}P{1}".format(rl.entidad, rl.propiedad);

                var ctl = $('#htmlOutput [view-model="{0}"]'.format(db_id2)).not('a').not('button');
                if (ctl.length <= 0) {
                    ctl = $('#htmlOutput [view-model="{0}"]'.format(db_id)).not('a').not('button');
                }

                var ctlParent = ctl.parent();
                ctl.removeClass('sat-obligatorio');

                modificarUIValidacion(result, regla, reglaEntidad, db_id, db_id2, ctl, ctlParent, rl);
            } catch (err) {
                if (AppDeclaracionesSAT.getConfig('debug')) {
                    console.log("Mensaje de error {0} -:- Regla {1}".format(err.message, reglaEntidad.definicion));
                }
            }
        }

        return result;
    }

    function modifiyExprs(exprs, reglaEntidad) {
        if (exprs !== null) {
            $.each(exprs, function(k, expr) {
                var parentesisAbre = fbUtils.buscarCadena("(", expr);
                var parentesisCierra = fbUtils.buscarCadena(")", expr);
                var ultimoCierra = parentesisCierra[parentesisCierra.length - 1];
                if (parentesisAbre.length === 1 && parentesisCierra.length === 1) {
                    reglaEntidad.definicion = reglaEntidad.definicion.replace(expr, expr.replace("(", '("').replace(")", '")'));
                } else if (parentesisAbre.length > 1 && parentesisCierra.length > 1) {
                    var parametros = expr.substring(parentesisAbre[0] + 1, ultimoCierra);
                    reglaEntidad.definicion = reglaEntidad.definicion.replace(parametros, '"' + parametros + '"');
                }
            });
        }
    }

    function modifiyExprsMultiple(exprs, reglaEntidad) {
        if (exprs !== null) {
            $.each(exprs, function(k, expr) {
                var argsExprs = expr.match(/[$](\w+|[0-9^_]+)/igm);
                var tmp = expr;
                $.each(argsExprs, function(k, argsExpr) {
                    expr = expr.replace(new RegExp("\\" + argsExpr, 'igm'), function(match, offset, str) {
                        if (str.substr(offset - 1, 1) !== "'" && str.substr(offset + match.length, 1) !== "'") {
                            if (str.substr(offset + match.length, 2) === '==')
                                return match;
                            else
                                return "'{0}'".format(match);
                        }
                        return match;
                    });
                });

                reglaEntidad.definicion = reglaEntidad.definicion.replace(tmp, expr);
            });
        }
    }

    function DeshabilitarCalculoGrid(db_id, regla) {
        var idEntidad = fbUtils.getEntidad(db_id);
        var definicion = $(regla).attr('definicion');
        var detalleGrid = FormsBuilder.ViewModel.getDetalleGrid();
        var reglas = FormsBuilder.XMLForm.getReglas();
        //var xmlCopy = FormsBuilder.XMLForm.getCopy();

        //var symbolsXml = Enumerable.From(reglas.propiedades.propiedad).Where("$.idRegla === '{0}'".format(regla.id)).ToArray(); 
        //xmlCopy.find('definicionReglas > propiedades > propiedad[idRegla="{0}"]'.format($(regla).attr('id')));
        var symbols = Enumerable.From(propiedades.propiedad).Where("$.idRegla == '{0}'".format(regla.id)).Select("$.idPropiedad").ToArray();
        // $.each(symbolsXml, function (k, sym) {
        //     symbols.push('$' + sym.idPropiedad);
        // });
        symbols.push(definicion.split("=")[0]);

        for (var symbol in symbols) {
            for (var i = 0; i < detalleGrid[idEntidad].length; i++) {
                for (var detalleItem in detalleGrid[idEntidad][i]) {
                    var id = detalleItem.substring(detalleItem.indexOf('P') + 1, detalleItem.length);

                    var symbolDetalle = '$' + id;
                    var counter = id.split('_')[1];

                    if (counter === id.split('_')[1]) {
                        if (symbolDetalle === symbols[symbol] + '_' + counter) {
                            var searchSymbols = definicion.match('[$]{0}'.format(id.split('_')[0]));
                            if (searchSymbols !== null) {
                                $.each(searchSymbols, function(k, searchSymbol) {
                                    var matchSymbol = new RegExp("\\" + searchSymbol + "(?!([A-Z\d]|(_[0-9]*))+)|" + "\\" + searchSymbol + "((_[0-9]*)+)", "igm");

                                    definicion = definicion.replace(matchSymbol, function() {
                                        return searchSymbol + '_' + counter;
                                    });
                                    return false;
                                });
                            }
                        }
                    }
                }
            }
        }

        return definicion;
    }

    function CalculoGrid(db_id, regla) {
        if (AppDeclaracionesSAT.getConfig('esSelector') && SAT.Environment.settings('isDAS')) {
            if (regla.ejecutarEnSelector !== '1') {
                return;
            }
        }

        var idEntidad = fbUtils.getEntidad(db_id);
        var detalleGrid = FormsBuilder.ViewModel.getDetalleGrid();
        var result;
        var counter;
        var reglaEntidad = {};

        reglaEntidad.definicion = regla.definicion.trimAll();
        reglaEntidad.mensajeError = regla.mensajeError;
        reglaEntidad.idPropiedadAsociada = regla.idPropiedadAsociada;
        reglaEntidad.idRegla = regla.id;
        reglaEntidad.tipo = regla.tipoRegla;

        //var xmlCopy = FormsBuilder.XMLForm.getCopy();

        //var symbolsXml = xmlCopy.find('definicionReglas > propiedades > propiedad[idRegla="{0}"]'.format(regla.id));
        var symbols = Enumerable.From(propiedades.propiedad).Where("$.idRegla == '{0}'".format(regla.id)).Select("$.idPropiedad").ToArray();
        // $.each(symbolsXml, function (k, sym) {
        //     symbols.push('$' + $(sym).attr('idPropiedad'));
        // });
        symbols.push(reglaEntidad.definicion.split("=")[0]);

        for (var symbol in symbols) {
            for (var i = 0; i < detalleGrid[idEntidad].length; i++) {
                for (var detalleItem in detalleGrid[idEntidad][i]) {
                    var id = detalleItem.substring(detalleItem.indexOf('P') + 1, detalleItem.length);

                    var symbolDetalle = '$' + id;
                    counter = id.split('_')[1];

                    if (counter === db_id.split('_')[1]) {
                        if (symbolDetalle === symbols[symbol] + '_' + counter) {
                            var searchSymbols = reglaEntidad.definicion.match('[$]{0}'.format(id.split('_')[0]));
                            if (searchSymbols !== null) {
                                $.each(searchSymbols, function(k, searchSymbol) {
                                    var matchSymbol = new RegExp("\\" + searchSymbol + "(?!([A-Z\d]|(_[0-9]*))+)|" + "\\" + searchSymbol + "((_[0-9]*)+)", "igm");

                                    reglaEntidad.definicion = reglaEntidad.definicion.replace(matchSymbol, function() {
                                        return searchSymbol + '_' + counter;
                                    });
                                    return false;
                                });
                            }
                        }
                    }
                }
            }
        }

        try {
            var exprs;
            if (reglaEntidad.definicion.match(/CONTADORCONDICIONAL[(](.*)[)]/igm) === null) {
                exprs = reglaEntidad.definicion.match(/ESNULOGRID[(][$](\w+|[0-9^_]+)[)]/igm);
                modifiyExprs(exprs, reglaEntidad);

                exprs = reglaEntidad.definicion.match(/ELEMENTOSGRID[(][$](\w+|[0-9^_]+)[)]/igm);
                modifiyExprs(exprs, reglaEntidad);

                exprs = reglaEntidad.definicion.match(/VALORANTERIOR[(][$](\w+|[0-9^_]+)[)]/igm);
                modifiyExprs(exprs, reglaEntidad);
            }

            exprs = reglaEntidad.definicion.match(/SUMA[(](.*?)[)]/igm);
            if (exprs !== null) {
                $.each(exprs, function(k, expr) {
                    if (expr.indexOf(',') === -1) {
                        var exprsSuma = expr.match(/[_][0-9]+/);
                        if (exprsSuma !== null) {
                            $.each(exprsSuma, function(k, exprSuma) {
                                reglaEntidad.definicion = reglaEntidad.definicion.replace(expr, expr.replace(exprSuma, ''));
                                expr = expr.replace(exprSuma, '');
                            });
                        }
                    }
                    reglaEntidad.definicion = reglaEntidad.definicion.replace(expr, expr.replace("(", '("').replace(")", '")'));
                });
            }

            exprs = reglaEntidad.definicion.match(/SUMAGRID[(](.*?)[)]/igm);
            if (exprs !== null) {
                $.each(exprs, function(k, expr) {
                    if (expr.indexOf(',') === -1) {
                        var encontroHijo = false;
                        var hermanos = [];
                        var filaPadre;

                        var symbols = reglaEntidad.definicion.match(/[$](\w+|[0-9^_]+)/igm);

                        var fila = symbols[1].split('_')[1];

                        var rl = FormsBuilder.ViewModel.getFieldsForExprs()[symbols[1].split('_')[0]];
                        var db_id = "E{0}P{1}".format(rl.entidad, rl.propiedad);

                        var relaciones = FormsBuilder.Modules.getRelacionesGrid();
                        for (var keyRelacionPadre in relaciones) {
                            for (var keyRelacion in relaciones[keyRelacionPadre]) {
                                if (keyRelacion == rl.entidad) {
                                    var nodoEncontrado = relaciones[keyRelacionPadre][keyRelacion];
                                    for (var padre in nodoEncontrado) {
                                        if (encontroHijo === false) {
                                            for (var hijo in nodoEncontrado[padre].hijos) {
                                                if (parseInt(fila) === parseInt(nodoEncontrado[padre].hijos[hijo].hijo)) {
                                                    filaPadre = nodoEncontrado[padre].padre;
                                                    encontroHijo = true;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (filaPadre !== undefined) {
                            var exprsCalculo = reglaEntidad.definicion.split("=");
                            if (exprsCalculo[0].split('_').length <= 1) {
                                reglaEntidad.definicion = reglaEntidad.definicion.replace(exprsCalculo[0], exprsCalculo[0] + '_' + filaPadre);
                            }
                        }
                    } else {
                        var encontroHijo = false;
                        var hermanos = [];
                        var filaPadre;

                        var symbols = reglaEntidad.definicion.match(/[$](\w+|[0-9^_]+)/igm);

                        var fila = symbols[1].split('_')[1];

                        var rl = FormsBuilder.ViewModel.getFieldsForExprs()[symbols[1].split('_')[0]];
                        var db_id = "E{0}P{1}".format(rl.entidad, rl.propiedad);

                        var relaciones = FormsBuilder.Modules.getRelacionesGrid();
                        for (var keyRelacionPadre in relaciones) {
                            for (var keyRelacion in relaciones[keyRelacionPadre]) {
                                if (keyRelacion == rl.entidad) {
                                    var nodoEncontrado = relaciones[keyRelacionPadre][keyRelacion];
                                    for (var padre in nodoEncontrado) {
                                        if (encontroHijo === false) {
                                            for (var hijo in nodoEncontrado[padre].hijos) {
                                                if (parseInt(fila) === parseInt(nodoEncontrado[padre].hijos[hijo].hijo)) {
                                                    filaPadre = nodoEncontrado[padre].padre;
                                                    encontroHijo = true;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (filaPadre !== undefined) {
                            var exprsCalculo = reglaEntidad.definicion.split("=");
                            reglaEntidad.definicion = reglaEntidad.definicion.replace(exprsCalculo[0], exprsCalculo[0] + '_' + filaPadre);
                        }
                    }
                    reglaEntidad.definicion = reglaEntidad.definicion.replace(expr, expr.replace("(", '("').replace(")", '")'));
                });
            }


            result = FormsBuilder.Runtime.evaluateGrid(reglaEntidad.definicion);

            if (AppDeclaracionesSAT.getConfig('view-rules')) {
                console.log("Resultado {0} -:- Tipo [{3}Grid] -:- RuleId {1}-:- Regla {2}".format(result, reglaEntidad.idRegla, reglaEntidad.definicion, reglaEntidad.tipo));
            }

            if (result !== undefined) {
                exprs = reglaEntidad.definicion.split("=");

                var rl = FormsBuilder.ViewModel.getFieldsForExprsGrid()[exprs[0]];
                if (rl !== undefined) {
                    var db_id2 = "E{0}P{1}".format(rl.entidad, rl.propiedad);

                    var detalleGrid2 = FormsBuilder.ViewModel.getDetalleGrid()[fbUtils.getEntidad(db_id2)];
                    for (var indexDetalle in detalleGrid2) {
                        if (detalleGrid2[indexDetalle][db_id2] !== undefined) {
                            detalleGrid2[indexDetalle][db_id2](result);

                            fbUtils.applyFormatCurrencyOnElement($('input[view-model="{0}"]'.format(db_id2)));

                        }
                    }
                } else {
                    exprs = reglaEntidad.definicion.split("=");

                    var rl = FormsBuilder.ViewModel.getFieldsForExprs()[exprs[0]];

                    var db_id2 = "E{0}P{1}".format(rl.entidad, rl.propiedad);
                    viewModel[fbUtils.getEntidad(db_id2)][db_id2](result);

                    var $input = $('input[view-model="{0}"]'.format(db_id2));
                    fbUtils.applyFormatCurrencyOnElement($input);

                }
            }
        } catch (err) {
            if (AppDeclaracionesSAT.getConfig('debug')) {
                console.log("Mensaje de error {0} -:- Regla {1}".format(err.message, reglaEntidad.definicion));
            }
        } finally {
            return result;
        }
    }

    function getDbIdsPropiedadesGrid(regla) {
        //var $xml = FormsBuilder.XMLForm.getCopy();
        var reglas = FormsBuilder.XMLForm.getReglas();
        var propiedadesVm = FormsBuilder.XMLForm.getEntidades();
        var idRegla = regla.id;
        //$(regla).attr("id");
        var propiedadesInvolved = Enumerable.From(reglas.propiedades.propiedad).Where("$.idRegla == '{0}'".format(idRegla)).ToArray();
        //$xml.find("definicionReglas propiedad[idRegla='{0}']".format(idRegla));
        var propiedadesGrid = {};
        $.each(propiedadesInvolved, function(index, propiedad) {
            var idPropiedad = propiedad.idPropiedad;
            var $entidad = FormsBuilder.XMLForm.buscarEntidadPorIdPropiedad(idPropiedad);
            //$xml.find("propiedad[id='{0}']".format(idPropiedad)).parents("entidad:first");
            var $atributo = Enumerable.From($entidad.atributos.atributo).Where("$.nombre === 'multiplicidad'").FirstOrDefault();
            //$entidad.find('atributo[nombre="multiplicidad"]');
            if ($atributo.valor == '*') {
                var infoProp = FormsBuilder.ViewModel.getFieldsForExprs()["${0}".format(idPropiedad)];
                var dbId = "E{0}P{1}".format(infoProp.entidad, infoProp.propiedad);
                propiedadesGrid[idPropiedad] = dbId;
            }
        });
        var temp = [];
        for (var index in propiedadesGrid) {
            temp.push(propiedadesGrid[index]);
        }
        propiedadesGrid = temp;
        return propiedadesGrid;
    }

    function applyRuleGridGeneric(regla) {

        console.log(">>>> Inicia 'ViewModel.applyRuleGridGeneric'");

        var dbIds = getDbIdsPropiedadesGrid(regla);
        var detalleGrid = FormsBuilder.ViewModel.getDetalleGrid();

        for (var index in dbIds) {
            var dbId = dbIds[index];
            var idEntidad = fbUtils.getEntidad(dbId);
            var grid = detalleGrid[idEntidad];
            for (var indexRow in grid) {
                for (var viewModelId in grid[indexRow]) {
                    var genericViewModelId = viewModelId.split("_")[0];
                    if (genericViewModelId === dbId) {
                        var tipoRegla = $(regla).attr('tipoRegla');
                        switch (tipoRegla) {
                            case 'Validacion':
                                if (SAT.Environment.settings('applyrulesvalidation') === true) {
                                    ValidacionGrid(viewModelId, regla);
                                }
                                break;

                            case 'Calculo':
                            case 'Condicional Excluyente':
                                if ((SAT.Environment.settings('isHydrate') === true &&
                                        regla.attr('ejecutarSiempre') !== '1') && AppDeclaracionesSAT.getConfig('forma') !== 'new')
                                    break;

                                CalculoGrid(viewModelId, regla);
                                break;
                        }
                    }
                }
            }
        }
    }

    function applyRulesDejarSinEfecto(db_id, claveInformativa, general) {

        console.log(">>>> Inicia 'ViewModel.applyRulesDejarSinEfecto'");

        var reglas = FormsBuilder.XMLForm.getReglas();
        var reglasEntidad = FormsBuilder.Runtime.getRules()[db_id];

        if (reglasEntidad === undefined)
            return;

        $.each(reglasEntidad, function (k, reglaEntidad) {
            var regla;

            if (rulesCache[reglaEntidad.idRegla] === undefined) {
                regla = Enumerable.From(reglas.reglas.regla).Where("$.id == '{0}'".format(reglaEntidad.idRegla)).FirstOrDefault();
                rulesCache[reglaEntidad.idRegla] = regla;
            } else {
                regla = rulesCache[reglaEntidad.idRegla];
            }

            if (claveInformativa !== undefined) {
                var enableRule = ($.inArray(claveInformativa, ["C5", "C20"]) >= 0);
            }

            //var regla = $(reglas).find('regla[id="{0}"]'.format(reglaEntidad.idRegla));
            if (regla.validaSeccion === '1' || regla.validaSeccionAlEntrar === '1') {
                return;
            }

            reglaEntidad.definicion = regla.definicion;

            if (typeof enableRule !== 'undefined') {
                if (enableRule === false && regla.ejecutarEnDejarSinEfecto !== '1') {
                    return;
                }
            } else if (general === true && regla.ejecutarEnDejarSinEfecto !== '1') {
                return;
            }

            var tipoRegla = regla.tipoRegla;
            switch (tipoRegla) {
                case 'Validacion':
                    Validacion(db_id, regla);
                    break;
                case 'Visual':
                    Visual(regla);
                    break;
                case 'Calculo':
                case 'Condicional Excluyente':
                    Calculo(regla);
                    break;
            }

        });
    }

    function applyRule(db_id, newValue, modoEjecucion) {

        console.log(">>>> Inicia 'ViewModel.applyRule'");

        var reglas = FormsBuilder.XMLForm.getReglasEjecutarSiempre();

        var reglasEntidad = FormsBuilder.Runtime.getRules()[db_id];

        if (db_id == 'E380001POCISR') {
            var ocisr = newValue == 1 ? "Determinación del ISR con coeficiente de utilidad" : "Determinación del ISR con gastos"
            $('.ocisr').text(ocisr);

            if (newValue == -1) {
                $("#btnPresentarDeclaracion").hide();
                $("#btnRegresarPms.btn.btn-primary.icon").hide();
                $("#btnEnviarDeclara").hide();
                $("#btnGuardar").hide();

                $('#btnRegresarPms.btn.btn-primary.icon').unbind('click', bindRegresa);
                $('#btnPresentarDeclaracion').unbind('click', bindPresenta);
                $("#btnGuardar").unbind('click', bindGuardar);
            }
            else {
                $("#btnPresentarDeclaracion").show();
                $("#btnEnviarDeclara").hide();
                $("#btnGuardar").show();

                $('#btnPresentarDeclaracion').unbind('click', bindPresenta);
                $("#btnGuardar").unbind('click', bindGuardar);
                $('#btnPresentarDeclaracion').on('click', bindPresenta);
                $("#btnGuardar").on('click', bindGuardar);

                var declaracion = AppDeclaracionesSAT.getConfig('configuracionDeclaracion');

                if (declaracion.esPrecarga == 'True') {
                    $("#btnRegresarPms.btn.btn-primary.icon").show();
                    $('#btnRegresarPms.btn.btn-primary.icon').unbind('click', bindRegresa);
                    $('#btnRegresarPms.btn.btn-primary.icon').on('click', bindRegresa);
                }
                else {
                    $("#btnRegresarPms.btn.btn-primary.icon").hide();
                    $('#btnRegresarPms.btn.btn-primary.icon').unbind('click', bindRegresa);
                }
            }

        }

        if (reglasEntidad === undefined)
            return;

        $.each(reglasEntidad, function(k, reglaEntidad) {
            var regla;

            if (rulesCache[reglaEntidad.idRegla] === undefined) {
                regla = Enumerable.From(reglas).Where("$.id == '{0}'".format(reglaEntidad.idRegla)).FirstOrDefault();
                rulesCache[reglaEntidad.idRegla] = regla;
            } else {
                regla = rulesCache[reglaEntidad.idRegla];
            }

            if (regla) {
                if ((regla.validaSeccion && regla.validaSeccion == '1') || (regla.validaSeccionAlEntrar && regla.validaSeccionAlEntrar == '1')) {
                    return;
                }
                var tipoRegla = regla.tipoRegla;

                //var participaEnGrid = regla.participaEnGrid;
                if (regla.definicion.search(/SUMAGRID/ig) > -1) {
                    //applyRuleGridGeneric(regla, db_id);
                    var sumas = fbUtils.extraerFuncion(FN_SUMAGRID, regla.definicion.toUpperCase());

                    for (var i = 0; i < sumas.length; i++) {
                        var suma = sumas[i];
                        var parametros = fbUtils.obtenerParametros(FN_SUMAGRID, suma);
                        var nuevaSuma = suma;

                        for (var j = 0; j < parametros.length; j++) {
                            var parametro = parametros[j];
                            var columnaGrid = "{0}_{1}_{2}".format(PREFIJO_GRID, regla.idEntidad, parametro);
                            nuevaSuma = nuevaSuma.replace(parametro, columnaGrid);
                        }

                        regla.definicion = regla.definicion.replace(suma, nuevaSuma);
                    }
                }

                if (SAT.Environment.settings('actualizacionimporte') === true) {
                    if (regla.tipoRegla === 'Visual' &&
                        regla.definicion.trimAll().match(/[^IN]HABILITAR[(][$](\w+|[0-9^_]+)[)]/igm)) {
                        return;
                    }
                }

                switch (tipoRegla) {
                    case 'Validacion':
                        if (SAT.Environment.settings('applyrulesvalidation') === true) {
                            Validacion(db_id, regla);
                        }
                        break;
                    case 'Visual':
                        if (SAT.Environment.settings('dejarsinefecto') === false) {
                            Visual(regla);
                        }
                        break;
                    case 'Calculo':
                    case 'Condicional Excluyente':
                        if ((SAT.Environment.settings('isHydrate') === true &&
                                regla.ejecutarSiempre !== '1') && AppDeclaracionesSAT.getConfig('forma') !== 'new')
                            break;

                        Calculo(regla);
                        break;
                }
            }
        });
    }

    function Validacion(db_id, regla) {
        if (AppDeclaracionesSAT.getConfig('esSelector') && SAT.Environment.settings('isDAS')) {
            if (regla.ejecutarEnSelector !== '1') {
                return;
            }
        }

        var result;
        var reglaEntidad = {};
        reglaEntidad.definicion = regla.definicion.trimAll();
        reglaEntidad.mensajeError = regla.mensajeError;
        reglaEntidad.idPropiedadAsociada = regla.idPropiedadAsociada;
        reglaEntidad.idRegla = regla.id;

        try {
            var exprs = reglaEntidad.definicion.match(/ESNULO[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = fbUtils.extraerFuncion("SUMA", reglaEntidad.definicion);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/ESCLABE[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/ESCLABEDIGITOVERIFICADOR[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/ESCLABEPLAZABANCARIA[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/ELEMENTOSCOMBO[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/ESENTEROPOSITIVO[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/ESENTERONEGATIVO[(][$](\w+|[0-9^_]+)[)]/igm);
            if (exprs !== null) {
                $.each(exprs, function(index, expr) {
                    var idExpression = "${0}".format(db_id.substring(db_id.indexOf('P') + 1, db_id.length));
                    reglaEntidad.definicion = reglaEntidad.definicion.replace(expr, expr.replace(")", ',"{0}")'.format(idExpression)));
                });
            }

            reglaEntidad.mensajeError = procesarMensajeError(reglaEntidad.mensajeError, db_id.split('_')[1]);

            result = FormsBuilder.Runtime.evaluate(reglaEntidad.definicion);
            var resultado = [reglaEntidad.tipo, result];

            if (AppDeclaracionesSAT.getConfig('view-rules')) {
                console.log("Resultado {0} -:- Tipo [Validacion] -:- RuleId {1}-:- Regla {2}".format(resultado, reglaEntidad.idRegla, reglaEntidad.definicion));
            }

            var rl = FormsBuilder.ViewModel.getFieldsForExprs()['$' + reglaEntidad.idPropiedadAsociada];
            var db_id2 = "E{0}P{1}".format(rl.entidad, rl.propiedad);

            var ctl = $('#htmlOutput [view-model="{0}"]'.format(db_id2)).not('a').not('button');
            var ctlParent = ctl.parent();
            ctl.removeClass('sat-obligatorio');

            modificarUIValidacion(result, regla, reglaEntidad, db_id, db_id2, ctl, ctlParent, rl);
        } catch (err) {
            if (AppDeclaracionesSAT.getConfig('debug')) {
                console.log("Mensaje de error {0} -:- Regla {1}".format(err.message, reglaEntidad.definicion));
            }
        } finally {
            return result;
        }
    }

    function modificarUIValidacion(result, regla, reglaEntidad, db_id, db_id2, ctl, ctlParent, rl) {

        console.log(">>>> Inicia 'modificarUIValidacion'" + db_id + " | " + db_id2);

        //var xmlCopy = FormsBuilder.XMLForm.getCopy();
        var controlesJson = FormsBuilder.XMLForm.getControles();

        try {
            if (!result) {
                var saltarErrores = false;
                if (regla.limpiarCampoNoValido === '1') {
                    var ctlClean = $('#htmlOutput [view-model="{0}"]'.format(db_id));
                    if (!$(ctlClean).is(":disabled")) {
                        viewModel[fbUtils.getEntidad(db_id)][db_id]('');
                        saltarErrores = true;
                    }
                }

                if (regla.mensajeErrorEnDialogo === '1') {
                    if (!AppDeclaracionesSAT.getConfig("deshabilitarDialogos")) {
                        var existeMensaje = false;
                        $.each($("#modalSeccion .modal-body > div"), function(k, v) {
                            if (reglaEntidad.mensajeError === $(v).html()) {
                                existeMensaje = true;
                            }
                        });
                        if (existeMensaje === false) {
                            $("#modalSeccion .modal-body").append("<div>{0}</div>".format(reglaEntidad.mensajeError));
                        }
                        $("#modalSeccion").modal('show');
                        document.activeElement.blur();
                    }
                } else {
                    if (ctlParent.length > 0) { //Se agrego para deducciones personales
                        if (saltarErrores === false) {
                            var idPanel = FormsBuilder.Parser.getSeccionesUI(rl.entidad);
                            ctl.addClass('alert');
                            if (ctl.attr('columnaFixed')) {
                                ctl.addClass('alertFixed');
                            }
                            if (ctlParent.find("i[vm={0}]".format(db_id2)).length <= 0) {
                                var iconError = $('<i vm="{0}" class="icon-warning-sign sat-icon"></i>'.format(db_id2));
                                iconError.attr('rules', JSON.stringify([regla.id]));
                                iconError.attr('excluirEnGrid', regla.excluirEnGrid === "1", "1");

                                ctl.after(iconError);

                                if (ctl.attr('cuadrodialogo') === undefined) {
                                    ctl.css('display', 'inline-block');
                                    ctl.css('margin-right', '5px');
                                } else {
                                    ctl.css('width', '71%');
                                }

                                if (SAT.Environment.settings('isDAS')) {
                                    ctlParent.find('i[vm="{0}"]'.format(db_id2)).on('click', function() {
                                        var mdAyuda = $('#modal-error');
                                        mdAyuda.find('.modal-body').html(reglaEntidad.mensajeError);
                                        mdAyuda.modal('show');
                                        document.activeElement.blur();
                                    });
                                    setBadgeCount(ctlParent);
                                } else {
                                    ctlParent.find('i[vm="{0}"]'.format(db_id2)).popover('destroy');
                                    ctlParent.find('i[vm="{0}"]'.format(db_id2)).popover({
                                        trigger: 'click',
                                        placement: "left",
                                        content: '<div vm="{0}"><div style="clear: both"></div>{1}</div>'.format(db_id2, reglaEntidad.mensajeError),
                                        html: "true"
                                    });

                                    var seccion = $('.container-submenus li a[idPanel="{0}"]'.format(idPanel));
                                    if (!seccion.parent().hasClass('hidden')) {
                                        $('.panelalert').find('[dbid="{0}"]'.format(db_id2)).remove();
                                        if ($('.panelalert').find("i[entidad='{0}']".format(rl.entidad)).length === 0 &&
                                            $('.panelalert').find("div[entidad='{0}']".format(rl.entidad)).length === 0) {
                                            var tituloCorto = "MENSAJE!!!!";
                                            //xmlCopy.find('formulario > controles').children('[idEntidadPropiedad="{0}"]'.format(rl.entidad)).children('atributos').children('atributo[nombre="TituloCorto"]').attr('valor')
                                            //    || FormsBuilder.XMLForm.getCopy().find('formulario controles').children('[idEntidadPropiedad="{0}"]'.format(rl.entidad)).children('atributos').children('atributo[nombre="TituloCorto"]').attr('valor');
                                            $('.panelalert').append("<div class='group' entidad='{0}'>{1}</div>".format(rl.entidad, tituloCorto));
                                            $('.panelalert').append("<i entidad='{0}' dbid='{1}' rule='{2}'>{3}</i>".format(rl.entidad, db_id2, regla.id, reglaEntidad.mensajeError));
                                        } else {
                                            var group = $('.panelalert').find("div[entidad='{0}']".format(rl.entidad));
                                            $("<i entidad='{0}' dbid='{1}' rule='{2}'>{3}</i>".format(rl.entidad, db_id2, regla.id, reglaEntidad.mensajeError)).appendTo(group);
                                        }
                                    }

                                    $('.number').html($('.panelalert i').length);

                                    ctlParent.find('i[vm="{0}"]'.format(db_id2)).on('shown.bs.popover', function() {
                                        fbUtils.applyFormatCurrencyOnElement(ctlParent.find('div[vm="{0}"] span.currency'.format(db_id2)), true);
                                    });
                                }
                            } else {
                                var iconError = ctlParent.find('i[vm="{0}"]'.format(db_id2));
                                var rulesIcon = JSON.parse(iconError.attr('rules'));
                                var indexRule = $.inArray(regla.id, rulesIcon);

                                if (indexRule === -1) {
                                    rulesIcon.push(regla.id);
                                    iconError.attr('rules', JSON.stringify(rulesIcon));
                                }

                                if (SAT.Environment.settings('isDAS')) {
                                    ctlParent.find('i[vm="{0}"]'.format(db_id2)).on('click', function() {
                                        var mdAyuda = $('#modal-error');
                                        mdAyuda.find('.modal-body').html(reglaEntidad.mensajeError);
                                        mdAyuda.modal('show');
                                        document.activeElement.blur();
                                    });
                                    setBadgeCount(ctlParent);
                                } else {
                                    ctlParent.find('i[vm="{0}"]'.format(db_id2)).popover('destroy');
                                    ctlParent.find('i[vm="{0}"]'.format(db_id2)).popover({
                                        trigger: 'click',
                                        placement: "left",
                                        content: '<div vm="{0}"><div style="clear: both"></div>{1}</div>'.format(db_id2, reglaEntidad.mensajeError),
                                        html: "true"
                                    });

                                    $('.panelalert').find('[dbid="{0}"]'.format(db_id2)).remove();
                                    if ($('.panelalert').find("i[entidad='{0}']".format(rl.entidad)).length === 0 &&
                                        $('.panelalert').find("div[entidad='{0}']".format(rl.entidad)).length === 0) {
                                        var tituloCorto = "MENSAJE!!!";
                                        //xmlCopy.find('formulario > controles').children('[idEntidadPropiedad="{0}"]'.format(rl.entidad)).children('atributos').children('atributo[nombre="TituloCorto"]').attr('valor')
                                        //  || FormsBuilder.XMLForm.getCopy().find('formulario controles').children('[idEntidadPropiedad="{0}"]'.format(rl.entidad)).children('atributos').children('atributo[nombre="TituloCorto"]').attr('valor');
                                        $('.panelalert').append("<div class='group' entidad='{0}'>{1}</div>".format(rl.entidad, tituloCorto));
                                        $('.panelalert').append("<i entidad='{0}' dbid='{1}' rule='{2}'>{3}</i>".format(rl.entidad, db_id2, regla.id, reglaEntidad.mensajeError));
                                    } else {
                                        var group = $('.panelalert').find("div[entidad='{0}']".format(rl.entidad));
                                        $("<i entidad='{0}' dbid='{1}' rule='{2}'>{3}</i>".format(rl.entidad, db_id2, regla.id, reglaEntidad.mensajeError)).appendTo(group);
                                    }
                                    $('.number').html($('.panelalert i').length);

                                    ctlParent.find('i[vm="{0}"]'.format(db_id2)).on('shown.bs.popover', function() {
                                        fbUtils.applyFormatCurrencyOnElement(ctlParent.find('div[vm="{0}"] span.currency'.format(db_id2)), true);
                                    });
                                }
                            }
                        }
                    }
                }
            } else {
                setTimeout(function() {
                    if (ctlParent.find('i[vm="{0}"]'.format(db_id2)).length > 0) {
                        var iconError = ctlParent.find('i[vm="{0}"]'.format(db_id2));
                        var rulesIcon = JSON.parse(iconError.attr('rules'));
                        var indexRule = $.inArray(regla.id, rulesIcon);

                        if (indexRule >= 0) {
                            rulesIcon.splice(indexRule, 1);
                            iconError.attr('rules', JSON.stringify(rulesIcon));
                            $('.panelalert').find('i[rule="{0}"][dbid="{1}"]'.format(regla.id, db_id2)).remove();
                            $('.number').html($('.panelalert i').length);
                            if ($('.panelalert').find("i[entidad='{0}']".format(rl.entidad)).length === 0) {
                                $('.panelalert').find("div[entidad='{0}']".format(rl.entidad)).remove();
                            }

                            if ($('#htmlOutput i[vm]').length === 0) {
                                $('.panelalert').find('i[rule]').remove();
                                $('.number').html(0);
                            }

                            if (rulesIcon.length <= 0) {
                                var iconValidacion = ctlParent.find('i[vm="{0}"]'.format(db_id2));
                                iconValidacion.popover('destroy');
                                iconValidacion.remove();

                                if (ctl.attr('cuadrodialogo') === undefined) {
                                    if (ctl.is(':visible')) {
                                        ctl.css('display', 'block');
                                    }
                                    ctl.css('margin-right', '0px');
                                } else {
                                    ctl.css('width', '80%');
                                }

                                ctl.removeClass('alert');
                                if (ctl.attr('columnaFixed')) {
                                    ctl.removeClass('alertFixed');
                                }
                                ctl.removeClass('sat-obligatorio');
                            }
                        }
                    } else {
                        $('.panelalert').find('i[rule="{0}"][dbid="{1}"]'.format(regla.id, db_id2)).remove();
                        $('.number').html($('.panelalert i').length);
                        if ($('.panelalert').find("i[entidad='{0}']".format(rl.entidad)).length === 0) {
                            $('.panelalert').find("div[entidad='{0}']".format(rl.entidad)).remove();
                        }

                        if ($('#htmlOutput i[vm]').length === 0) {
                            $('.panelalert').find('i[rule]').remove();
                            $('.number').html(0);
                        }
                    }
                    $('#htmlOutput').find('.popover').remove();

                    if (SAT.Environment.settings('isDAS')) {
                        setBadgeCount(ctlParent);
                    }
                }, 10);
            }
        } catch (err) {
            console.log(err.message);
        }
    }

    function setBadgeCount(ctlParent, clean) {
        if (ctlParent.length <= 0)
            return;

        var search = true;
        var objCtrl = ctlParent.parent();
        while (search & objCtrl.length > 0) {
            if (objCtrl.hasClass('ficha-collapse')) {
                search = false;
            } else {
                objCtrl = objCtrl.parent();
            }
        }
        var numErrors = objCtrl.find('i.icon-warning-sign').length;
        var titleCollapse = objCtrl.find('.panel-heading > .panel-title');
        if (numErrors <= 0) {
            titleCollapse.find('span.badge').remove();
        } else {
            if (titleCollapse.find('span.badge').length <= 0) {
                titleCollapse.append('<span class="badge">{0}</span>'.format(numErrors));
            } else {
                titleCollapse.find('span.badge').html(numErrors);
            }
        }

        if (clean === true) {
            titleCollapse.find('span.badge').remove();
        }
    }

    function Visual(regla) {
        if (AppDeclaracionesSAT.getConfig('esSelector') && SAT.Environment.settings('isDAS')) {
            if (regla.ejecutarEnSelector !== '1') {
                return;
            }
        }

        var reglaEntidad = {};
        reglaEntidad.definicion = regla.definicion.trimAll();
        reglaEntidad.mensajeError = regla.mensajeError;
        reglaEntidad.idPropiedadAsociada = regla.idPropiedadAsociada;
        reglaEntidad.idRegla = regla.id;

        try {
            var exprs = reglaEntidad.definicion.match(/ESNULO[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/OCULTAR[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/MOSTRAR[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/LIMPIARCHECK[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/DESHABILITAR[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/INHABILITAR[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/[^IN]HABILITAR[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/OBLIGATORIO[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/ELEMENTOSCOMBO[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/ESENTEROPOSITIVO[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = fbUtils.extraerFuncion("MOSTRARCONTENEDOR", reglaEntidad.definicion);
            modifiyExprs(exprs, reglaEntidad);

            exprs = fbUtils.extraerFuncion("OCULTARCONTENEDOR", reglaEntidad.definicion);
            modifiyExprs(exprs, reglaEntidad);

            if (reglaEntidad.definicion.match(/ELEMENTOSGRID[(](.*)[)]/igm) === null) {
                FormsBuilder.Runtime.evaluate(reglaEntidad.definicion);
            } else {
                var dbIds = getDbIdsPropiedadesGrid(regla);
                var detalleGrid = FormsBuilder.ViewModel.getDetalleGrid();

                for (var index in dbIds) {
                    var dbId = dbIds[index];
                    var idEntidad = fbUtils.getEntidad(dbId);
                    var grid = detalleGrid[idEntidad];
                    if (grid.length == 0) {
                        FormsBuilder.Runtime.evaluate(reglaEntidad.definicion);
                    } else {
                        for (var indexRow in grid) {
                            for (var viewModelId in grid[indexRow]) {
                                var genericViewModelId = viewModelId.split("_")[0];
                                if (genericViewModelId === dbId) {
                                    VisualGrid(viewModelId, regla);
                                }
                            }
                        }
                    }
                }
            }

            if (AppDeclaracionesSAT.getConfig('view-rules')) {
                console.log("Resultado N/A -:- Tipo [Visual] -:- RuleId {0}-:- Regla {1}".format(reglaEntidad.idRegla, reglaEntidad.definicion));
            }
        } catch (err) {
            if (AppDeclaracionesSAT.getConfig('debug')) {
                console.log("Mensaje de error {0} -:- Regla {1}".format(err.message, reglaEntidad.definicion));
            }
        }
    }

    function Calculo(regla) {

        console.log("Inicia 'ViewModel.Calculo'");

        if (AppDeclaracionesSAT.getConfig('esSelector') && SAT.Environment.settings('isDAS')) {
            if (regla.ejecutarEnSelector !== '1') {
                return;
            }
        }

        var result;
        var reglaEntidad = {};
        reglaEntidad.definicion = regla.definicion.trimAll();
        reglaEntidad.mensajeError = regla.mensajeError;
        reglaEntidad.idPropiedadAsociada = regla.idPropiedadAsociada;
        reglaEntidad.idRegla = regla.id;
        reglaEntidad.tipo = regla.tipoRegla;

        try {
            var exprs = reglaEntidad.definicion.match(/ESNULO[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = fbUtils.extraerFuncion("SUMA", reglaEntidad.definicion);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/SUMAGRID[(](.*?)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/ESENTEROPOSITIVO[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            exprs = reglaEntidad.definicion.match(/ELEMENTOSCOMBO[(][$](\w+|[0-9^_]+)[)]/igm);
            modifiyExprs(exprs, reglaEntidad);

            result = FormsBuilder.Runtime.evaluate(reglaEntidad.definicion);

            console.log("REGLA: " + reglaEntidad.definicion);
            console.log("RESULTADO: " + result);

            if (AppDeclaracionesSAT.getConfig('view-rules')) {
                console.log("Resultado {0} -:- Tipo [{3}] -:- RuleId {1}-:- Regla {2}".format(result, reglaEntidad.idRegla, reglaEntidad.definicion, reglaEntidad.tipo));
            }

            if (result !== undefined) {
                exprs = reglaEntidad.definicion.split("=");

                var rl = FormsBuilder.ViewModel.getFieldsForExprs()[exprs[0]];

                var db_id2 = "E{0}P{1}".format(rl.entidad, rl.propiedad);
                viewModel[fbUtils.getEntidad(db_id2)][db_id2](result);

                var $input = $('input[view-model="{0}"]'.format(db_id2));
                fbUtils.applyFormatCurrencyOnElement($input);
            }
        } catch (err) {
            if (AppDeclaracionesSAT.getConfig('debug')) {
                console.log("Mensaje de error {0} -:- Regla {1}".format(err.message, reglaEntidad.definicion));
            }
        } finally {
            return result;
        }
    }

    function procesarMensajeErrorGrid(mensaje, counter) {
        //var xmlCopy = FormsBuilder.XMLForm.getCopy();
        var entidadesJson = FormsBuilder.XMLForm.getEntidades();
        var exprs = mensaje.match(/SUMACONDICIONAL[(](.*?)[)]/igm);
        var objTemp = { definicion: mensaje };
        modifiyExprsMultiple(exprs, objTemp);

        mensaje = objTemp.definicion;

        var exprs = mensaje.match(/\B#\w+[0-9|A-Z^_]+/igm);
        if (exprs !== null) {
            $.each(exprs, function(k, expr) {
                var propiedad = Enumerable.From(entidadesJson).SelectMany("$.propiedades.propiedad").Where("$.id == '{0}'".format(expr.substring(1, expr.length))).FirstOrDefault();
                //$(xmlCopy).find('modeloDatos propiedad[id="{0}"]'.format(expr.substring(1, expr.length)));
                if (propiedad) {
                    var tituloCorto = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre='TituloCorto'").Select("$.valor").FirstOrDefault();
                    //propiedad.find('atributo[nombre="TituloCorto"]').attr('valor');
                    mensaje = mensaje.replace(expr, "<b>{0}</b>".format(tituloCorto || ""));
                }
            });
        }

        exprs = mensaje.match(/\{([^{}]+)\}/igm);
        var corchetes = false;
        if (exprs === null) {
            exprs = mensaje.match(/\[.*]/igm);
            corchetes = true;
        }

        if (exprs !== null) {
            var exprCalculoTemporal;
            var exprCalculo;

            $.each(exprs, function(k, expr) {
                var objDictionary = {};
                exprCalculoTemporal = expr;
                exprCalculo = (corchetes === true) ? expr : expr.replace(/\[|]/igm, "");

                var searchSymbols = expr.match(/[$](\w+|[0-9^_]+)/igm);
                if (searchSymbols !== null) {
                    $.each(searchSymbols, function(k, searchSymbol) {
                        var matchSymbol = new RegExp("\\" + searchSymbol + "(?![A-Z]|[0-9])", "igm");
                        if (objDictionary[searchSymbol] === undefined) {
                            if (FormsBuilder.ViewModel.getFieldsForExprsGrid()["{0}_{1}".format(searchSymbol, counter)] !== undefined) {
                                exprCalculo = exprCalculo.replace(matchSymbol, function() {
                                    return searchSymbol + '_' + counter;
                                });
                            }
                        }
                        objDictionary[searchSymbol] = searchSymbol;
                    });
                }

                var exprsSymbolSuma = exprCalculo.match(/SUMA[(](.*?)[)]/igm);
                if (exprsSymbolSuma !== null) {
                    $.each(exprsSymbolSuma, function(k, exprSymbol) {
                        if (exprSymbol.indexOf(',') === -1) {
                            var exprsNumero = exprSymbol.match(/[_][0-9]+/);
                            if (exprsNumero !== null) {
                                $.each(exprsNumero, function(k, exprSuma) {
                                    exprCalculo = exprCalculo.replace(exprSymbol, exprSymbol.replace(exprSuma, ''));
                                    exprSymbol = exprSymbol.replace(exprSuma, '');
                                });
                            }
                        }
                        exprCalculo = exprCalculo.replace(exprSymbol, exprSymbol.replace("(", '("').replace(")", '")'));
                    });
                }

                try {
                    var result = FormsBuilder.Runtime.evaluateGrid(exprCalculo.replace(/\{|\}/igm, ''));
                } catch (err) {
                    if (AppDeclaracionesSAT.getConfig('debug')) {
                        console.log("Mensaje de error {0} -:- Regla {1}".format(err.message, exprCalculo.replace(/\{|\}/igm, '')));
                    }
                }

                var notNumber = mensaje.substr(mensaje.indexOf(exprCalculoTemporal) - 1, 1) === '!';
                if (notNumber) exprCalculoTemporal = '!' + exprCalculoTemporal;

                if (ESNUMERO(result) && !notNumber) {
                    var fieldCurrency = $("<span class='currency' mostrarDecimales='2'>{0}</span>".format(result));
                    fbUtils.applyFormatCurrencyOnElement(fieldCurrency, true);
                    result = fieldCurrency.html();
                }
                mensaje = mensaje.replace(exprCalculoTemporal, result);
            });
        }

        return mensaje;
    }

    function procesarMensajeError(mensaje) {
        //var xmlCopy = FormsBuilder.XMLForm.getCopy();
        var entidadesJson = FormsBuilder.XMLForm.getEntidades();
        var exprs = mensaje.match(/\B#\w+[0-9|A-Z^_]+/igm);
        if (exprs !== null) {
            $.each(exprs, function(k, expr) {
                var propiedad = Enumerable.From(entidadesJson).SelectMany("$.propiedades.propiedad").Where("$.id == '{0}'".format(expr.substring(1, expr.length))).FirstOrDefault();
                //$(xmlCopy).find('modeloDatos propiedad[id="{0}"]'.format(expr.substring(1, expr.length)));
                if (propiedad) {
                    var tituloCorto = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre='TituloCorto'").Select("$.valor").FirstOrDefault();
                    //propiedad.find('atributo[nombre="TituloCorto"]').attr('valor');
                    mensaje = mensaje.replace(expr, "<b>{0}</b>".format(tituloCorto || ""));
                }
            });
        }

        exprs = mensaje.match(/\{([^{}]+)\}/igm);
        var corchetes = false;
        if (exprs === null) {
            exprs = mensaje.match(/\[.*]/igm);
            corchetes = true;
        }

        if (exprs !== null) {
            var objDictionary = {};
            var exprCalculoTemporal;
            var exprCalculo;
            $.each(exprs, function(k, expr) {
                exprCalculoTemporal = expr;
                exprCalculo = (corchetes === true) ? expr : expr.replace(/\[|]/igm, "");

                var searchSymbols = expr.match(/[$](\w+|[0-9^_]+)/igm);
                if (searchSymbols !== null) {
                    $.each(searchSymbols, function(k, searchSymbol) {
                        var matchSymbol = new RegExp("\\" + searchSymbol + "(?![A-Z]|[0-9])", "igm");
                        objDictionary[searchSymbol] = searchSymbol;
                    });
                }

                var result = FormsBuilder.Runtime.evaluate(exprCalculo.replace(/\{|\}/igm, ''));

                var notNumber = mensaje.substr(mensaje.indexOf(exprCalculoTemporal) - 1, 1) === '!';
                if (notNumber) exprCalculoTemporal = '!' + exprCalculoTemporal;

                if (ESNUMERO(result) && !notNumber) {
                    var fieldCurrency = $("<span class='currency' mostrarDecimales='2'>{0}</span>".format(result));
                    fbUtils.applyFormatCurrencyOnElement(fieldCurrency, true);
                    result = fieldCurrency.html();
                }
                mensaje = mensaje.replace(exprCalculoTemporal, result);
            });
        }

        return mensaje;
    }

    function applyDataBindings(cb) {

        console.log(">>>> Inicia 'ViewModel.applyDataBindings'");

        var panels = $("#htmlOutput").children();
        //$('.panel[identidadpropiedad]');
        $.each(panels, function(key, panel) {
            try {
                $.each($(panel).find('[view-model]'), function(k, controlViewModel) {
                    var vmAttr = $(controlViewModel).attr('view-model');
                    var idEntidad = vmAttr.substring(1, vmAttr.indexOf('P'));
                    var vmEntidad = viewModel[parseInt(idEntidad)];

                    ko.applyBindings(vmEntidad, controlViewModel);
                });
            } catch (err) {
                console.log(err.message);
            }
        });

        if (cb && typeof cb === "function") {
            cb();
        }
    }

    function getEntitiesXml(entidades) {
        var newEntities = [];

        var seccionesVisibles = ['SAT_DATOS_GENERALES', 'SAT_DATOS_ACUSE', 'SAT_DATOS_ACUSE', 'SAT_DATOS_CONTRIBUYENTE', 'SAT_FOR'];
        var seccionesDialogo = ['SAT_OTROS_ESTIMULOS', 'SAT_COMPENSACIONES'];
        var clavesImpuestos = [];
        var gridsAnidados = [];

        for (var entityId in viewModel) {
            var atributos = Enumerable.From(entidades).Where("$.id == '{0}'".format(entityId)).Select("$.atributos.atributo").FirstOrDefault();
            //xmlCopy.find('entidad[id="{0}"]'.format(entityId)).children('atributos');
            var tipo = Enumerable.From(atributos).Where("$.nombre === 'tipo'").Select("$.valor").FirstOrDefault();
            //atributos.find('atributo[nombre="tipo"]').attr("valor");
            var claveimpuesto = Enumerable.From(atributos).Where("$.nombre === 'ClaveImpuesto'").Select("$.valor").FirstOrDefault();
            //atributos.find('atributo[nombre="ClaveImpuesto"]').attr("valor");

            var visibilidadSeccion = false;
            if (flujoSecciones[entityId] !== undefined) {
                if (flujoSecciones[entityId].NoVisible !== undefined) {
                    visibilidadSeccion = !flujoSecciones[entityId].NoVisible;
                }
            } else {
                if ($.inArray(tipo, seccionesVisibles) > -1) {
                    visibilidadSeccion = true;
                }
            }

            if (visibilidadSeccion === true) {
                if (claveimpuesto !== undefined) {
                    clavesImpuestos.push(claveimpuesto);
                }

                var relacionesGrid = FormsBuilder.Modules.getRelacionesGrid()[entityId];
                if (relacionesGrid !== undefined) {
                    var props = Object.getOwnPropertyNames(relacionesGrid);
                    if (props.length > 0)
                        gridsAnidados.push(props[0]);
                }
            }

            if ($.inArray(entityId, gridsAnidados) > -1) {
                visibilidadSeccion = true;
            }

            if ($.inArray(tipo, seccionesDialogo) > -1) {
                if ($.inArray(claveimpuesto, clavesImpuestos) > -1) {
                    visibilidadSeccion = true;
                }
            }

            if (visibilidadSeccion === true) {
                newEntities.push(entityId);
            }
        }

        return newEntities;
    }

    function setIsMobile() {
        var propsEsMovil = fieldsForExprs['$67'];

        if (propsEsMovil && propsEsMovil.entidad && propsEsMovil.propiedad) {
            var db_id = "E{0}P{1}".format(propsEsMovil.entidad, propsEsMovil.propiedad);
            viewModel[propsEsMovil.entidad][db_id](Number(SAT.Environment.settings('isMobile')));
        }
    }

    function createXml() {
        //var xmlCopy = FormsBuilder.XMLForm.getCopy();
        var xml = $($.parseXML('<?xml version="1.0" encoding="utf-8" ?><modeloDatos><relacionesGrid /><calculos /><SubRegimenes /><ClabesBancarias /></modeloDatos>'));
        var controles = FormsBuilder.XMLForm.getControles();
        var seccionesVisibles = ['SAT_DATOS_GENERALES', 'SAT_DATOS_ACUSE', 'SAT_DATOS_ACUSE', 'SAT_DATOS_CONTRIBUYENTE', 'SAT_FOR'];
        var seccionesDialogo = ['SAT_OTROS_ESTIMULOS', 'SAT_COMPENSACIONES'];
        var clavesImpuestos = [];
        var gridsAnidados = [];

        setIsMobile();

        for (var entityId in viewModel) {
            var entityNode = $('<entidad />', xml);
            var entidadesJson = FormsBuilder.XMLForm.getEntidades();
            var entidad = Enumerable.From(entidadesJson).Where("$.id == '{0}'".format(entityId)).FirstOrDefault();
            //xmlCopy.find('entidad[id="{0}"]'.format(entityId));
            var atributos = entidad.atributos.atributo;

            var tipo = Enumerable.From(atributos).Where("$.nombre === 'tipo'").Select("$.valor").FirstOrDefault();
            //atributos.find('atributo[nombre="tipo"]').attr("valor");
            var claveimpuesto = Enumerable.From(atributos).Where("$.nombre === 'ClaveImpuesto'").Select("$.valor").FirstOrDefault();
            //atributos.find('atributo[nombre="ClaveImpuesto"]').attr("valor");

            var visibilidadSeccion = false;
            if (!SAT.Environment.settings('isDAS')) {
                if (flujoSecciones[entityId] !== undefined) {
                    if (flujoSecciones[entityId].NoAplica !== undefined) {
                        entityNode.attr('noaplica', flujoSecciones[entityId].NoAplica);
                    }

                    if (flujoSecciones[entityId].NoVisible !== undefined) {
                        visibilidadSeccion = !flujoSecciones[entityId].NoVisible;
                    } else {
                        // visibilidadSeccion = true;
                    }

                    if (flujoSecciones[entityId]['EntroSeccion'] !== undefined) {
                        entityNode.attr('entroseccion', flujoSecciones[entityId]['EntroSeccion']);
                    }

                    if (flujoSecciones[entityId].OcultarMenuSeccion !== undefined) {
                        entityNode.attr('ocultarmenuseccion', flujoSecciones[entityId].OcultarMenuSeccion);
                    }
                } else {
                    if ($.inArray(tipo, seccionesVisibles) > -1) {
                        visibilidadSeccion = true;
                    }
                }
            } else {
                visibilidadSeccion = true;
            }

            entityNode.attr('visibilidad', visibilidadSeccion);
            if (visibilidadSeccion === true) {
                if (claveimpuesto !== undefined) {
                    clavesImpuestos.push(claveimpuesto);
                }

                var relacionesGrid = FormsBuilder.Modules.getRelacionesGrid()[entityId];
                if (relacionesGrid !== undefined) {
                    var props = Object.getOwnPropertyNames(relacionesGrid);
                    if (props.length > 0)
                        gridsAnidados.push(props[0]);
                }
            }

            if ($.inArray(entityId, gridsAnidados) > -1) {
                visibilidadSeccion = true;
            }

            if ($.inArray(tipo, seccionesDialogo) > -1) {
                if ($.inArray(claveimpuesto, clavesImpuestos) > -1) {
                    visibilidadSeccion = true;
                }
            }

            if (visibilidadSeccion === true) {
                var tituloCorto = Enumerable.From(atributos).Where("$.nombre === 'TituloCorto'").Select("$.valor").FirstOrDefault();
                var tituloLargo = Enumerable.From(atributos).Where("$.nombre === 'TituloLargo'").Select("$.valor").FirstOrDefault();
                var llave = Enumerable.From(atributos).Where("$.nombre === 'llave'").Select("$.valor").FirstOrDefault();

                entityNode.attr('claveimpuesto', claveimpuesto);
                entityNode.attr('id', entityId);
                entityNode.attr('titulo', tituloCorto);
                entityNode.attr('titulolargo', tituloLargo);
                entityNode.attr('tipo', tipo);
                entityNode.attr('clave', llave);

                var multiplicidad = Enumerable.From(atributos).Where("$.nombre === 'multiplicidad'").Select("$.valor").FirstOrDefault();
                //atributos.find('atributo[nombre="multiplicidad"]').attr("valor");
                if (multiplicidad === '*') {
                    //var esCargaMasiva = jsonPath.eval(controles, "$..[?(@.idEntidadPropiedad == '{0}' && @.tipoControl=='ControlesGridRetenciones')]".format(entityId));
                    //xmlCopy.find('formulario control[idEntidadPropiedad="{0}"][tipoControl="ControlesGridRetenciones"]'.format(entityId));
                    //if (esCargaMasiva.length > 0) {
                    //    var paginador = $('#htmlOutput .panel[idEntidadPropiedad="{0}"] .paginador'.format(entityId));
                    //    if (paginador.length > 0) {
                    //        entityNode.attr('pages', paginador.attr('pages'));
                    //        entityNode.attr('numElements', paginador.attr('numElements'));
                    //    }
                    //}

                    if (viewModelDetalle[entityId] !== undefined) {
                        entityNode.attr('numeroelementos', viewModelDetalle[entityId].length);
                        var orden = 1;
                        for (var detalleId in viewModelDetalle[entityId]) {
                            var propertyNode = $('<fila />', xml);
                            var detalle = viewModelDetalle[entityId][detalleId];
                            propertyNode.attr('identificador', orden);
                            propertyNode.attr('orden', orden);
                            orden++;

                            for (var det in detalle) {
                                var propertyFile = $('<propiedad />', xml);

                                var propiedad = Enumerable.From(entidad.propiedades.propiedad).Where("$.id == '{0}'".format(detalle[det].propiedad)).FirstOrDefault();
                                //entidad.find('propiedad[id="{0}"]'.format(detalle[det].propiedad));
                                var llavePropiedad = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'llave'").Select("$.valor").FirstOrDefault();
                                var ordenPropiedad = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'Orden'").Select("$.valor").FirstOrDefault();
                                var separaMilesPropiedad = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'SeparaMiles'").Select("$.valor").FirstOrDefault();
                                var otrosEstimulosPropiedad = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'TieneOtrosEstimulos'").Select("$.valor").FirstOrDefault();
                                var compensacionesPropiedad = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'TieneCompensaciones'").Select("$.valor").FirstOrDefault();
                                var compensacionTabPropiedad = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'EsCompensacionTabulada'").Select("$.valor").FirstOrDefault();
                                var fechaIsoPropiedad = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'EsFechaISO'").Select("$.valor").FirstOrDefault();

                                propertyFile.attr('id', detalle[det].propiedad);
                                propertyFile.attr('claveinformativa', propiedad.claveInformativa || '');
                                propertyFile.attr('clave', llavePropiedad || '');
                                // propertyFile.attr('titulo', propiedad.find('atributo[nombre="TituloCorto"]').attr("valor") || '');
                                propertyFile.attr('orden', ordenPropiedad || '');
                                propertyFile.attr('separamiles', separaMilesPropiedad || '');
                                propertyFile.attr('tieneotrosestimulos', otrosEstimulosPropiedad || '');
                                propertyFile.attr('tienecompensaciones', compensacionesPropiedad || '');
                                propertyFile.attr('escompensaciontabulada', compensacionTabPropiedad || '');
                                propertyFile.attr('esfechaiso', fechaIsoPropiedad || '');
                                propertyFile.attr('etiqueta', detalle[det].etiqueta || '');

                                var valorDetalle = detalle[det].valor;
                                var esFecha = /[0-9_]{2}\/[0-9_]{2}\/[0-9_]{4}/igm.test(valorDetalle);

                                if (esFecha) {
                                    //if (!IsNullOrEmpty(valorDetalle) && !isDateEmpty(valorDetalle)) {
                                    //    var date = FECHA(valorDetalle);
                                    //    if (date !== fbUtils.getDateMin()) {
                                            
                                    //        var dateISOString =  date.toISOString();
                                    //        propertyFile.text(dateISOString);
                                    //    }
                                    //}

                                    propertyFile.text(fbUtils.convertValue(valorDetalle, 'Fecha'));
                                } else {
                                    if (typeof(valorDetalle) === "string") {
                                        propertyFile.text(valorDetalle.replace(new RegExp(',', 'g'), ''));
                                    } else {
                                        propertyFile.text(valorDetalle);
                                    }
                                }

                                propertyNode.append(propertyFile);
                            }

                            entityNode.append(propertyNode);
                        }
                        $('modeloDatos', xml).append(entityNode);
                    } else {
                        entityNode.attr('grid', 1);

                        if (viewModelGrid[entityId] !== undefined) {
                            var relacionesGrid = FormsBuilder.Modules.getRelacionesGrid();
                            if (relacionesGrid[entityId] !== undefined) {
                                var relacionNode = $('<relacion />', xml);
                                for (var keyRelacionPadre in relacionesGrid[entityId]) {
                                    relacionNode.attr('entidadPadre', entityId);
                                    relacionNode.attr('entidadHijo', keyRelacionPadre);
                                    for (var keyRelacion in relacionesGrid[entityId][keyRelacionPadre]) {
                                        var propertyNode = $('<hijo />', xml);

                                        var fila = relacionesGrid[entityId][keyRelacionPadre][keyRelacion];
                                        var hijos = [];
                                        for (var keyHijo in fila.hijos) {
                                            hijos.push(fila.hijos[keyHijo].hijo);
                                        }

                                        propertyNode.attr('padre', fila.padre);
                                        propertyNode.attr('hijos', hijos.toString());

                                        relacionNode.append(propertyNode);
                                    }
                                }
                                $('modeloDatos relacionesGrid', xml).append(relacionNode);
                            }

                            var orden = 1;
                            // Se ignora el elemento activo del formulariogridedicion
                            var controlEdicionGrid = jsonPath.eval("$..[?(@.idEntidadPropiedad='{0}' && @.tipoControl='FormularioGridEdicion')]".format(entityId));
                            var numElementos = viewModelGrid[entityId].length;
                            var modeGrid = FormsBuilder.Modules.getModeGrid();

                            entityNode.attr('numeroelementos', (controlEdicionGrid && modeGrid === 'new') ? numElementos - 1 : numElementos);

                            for (var i = 0; i < viewModelGrid[entityId].length; i++) {
                                if (controlEdicionGrid.length > 0 && orden === numElementos && modeGrid === 'new') break;

                                var propertyNode = $('<fila />', xml);
                                var detalle = viewModelGrid[entityId][i];
                                propertyNode.attr('identificador', orden);
                                propertyNode.attr('orden', orden);
                                orden++;

                                for (var det in detalle) {
                                    var indice = det.split('_')[1];
                                    propertyNode.attr('indice', indice);

                                    var hasErrors = $("#htmlOutput table tr[tr-entidad=" + entityId + "][index=" + indice + "] i").length > 0;
                                    propertyNode.attr('error', hasErrors ? 1 : 0);

                                    var prop = det.substring(det.indexOf('P') + 1, det.length).split('_')[0];
                                    var propertyFile = $('<propiedad />', xml);

                                    var propiedad = Enumerable.From(entidad.propiedades.propiedad).Where("$.id == '{0}'".format(prop)).FirstOrDefault();
                                    //entidad.find('propiedad[id="{0}"]'.format(prop));
                                    var llaveGrid = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'llave'").Select("$.valor").FirstOrDefault();
                                    var ordenGrid = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'Orden'").Select("$.valor").FirstOrDefault();
                                    var separaMilesGrid = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'SeparaMiles'").Select("$.valor").FirstOrDefault();
                                    var otrosEstimulosGrid = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'TieneOtrosEstimulos'").Select("$.valor").FirstOrDefault();
                                    var compensacionesGrid = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'TieneCompensaciones'").Select("$.valor").FirstOrDefault();
                                    var compensacionTabGrid = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'EsCompensacionTabulada'").Select("$.valor").FirstOrDefault();
                                    var fechaIsoGrid = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'EsFechaISO'").Select("$.valor").FirstOrDefault();

                                    propertyFile.attr('id', prop);
                                    propertyFile.attr('claveinformativa', propiedad.claveInformativa || '');
                                    propertyFile.attr('clave', llaveGrid || '');
                                    // propertyFile.attr('titulo', propiedad.find('atributo[nombre="TituloCorto"]').attr("valor") || '');
                                    propertyFile.attr('orden', ordenGrid || '');
                                    propertyFile.attr('separamiles', separaMilesGrid || '');
                                    propertyFile.attr('tieneotrosestimulos', otrosEstimulosGrid || '');
                                    propertyFile.attr('tienecompensaciones', compensacionesGrid || '');
                                    propertyFile.attr('escompensaciontabulada', compensacionTabGrid || '');
                                    propertyFile.attr('esfechaiso', fechaIsoGrid || '');

                                    var valorGrid = detalle[det];
                                    var esFecha = /[0-9_]{2}\/[0-9_]{2}\/[0-9_]{4}/igm.test(valorGrid);

                                    if (esFecha) {
                                        //if (!IsNullOrEmpty(valorGrid) && !isDateEmpty(valorGrid)) {
                                        //    var date = FECHA(valorGrid);
                                        //    if (date !== fbUtils.getDateMin()) {
                                        //        var dateISOString = date.toISOString();
                                        //        propertyFile.text(dateISOString);
                                        //    }
                                        //}
                                        propertyFile.text(fbUtils.convertValue(valorGrid, 'Fecha'));

                                    } else {
                                        if (typeof(valorGrid) === "string") {
                                            propertyFile.text(valorGrid.replace(new RegExp(',', 'g'), ''));
                                        } else {
                                            propertyFile.text(valorGrid);
                                        }
                                    }

                                    propertyNode.append(propertyFile);
                                }

                                entityNode.append(propertyNode);
                            }
                            $('modeloDatos', xml).append(entityNode);
                        }
                    }
                } else {
                    for (var propertyName in viewModel[entityId]) {
                        var idPropiedad = propertyName.substring(propertyName.indexOf('P') + 1, propertyName.length);
                        var propiedad = Enumerable.From(entidad.propiedades.propiedad).Where("$.id == '{0}'".format(idPropiedad)).FirstOrDefault();
                        //entidad.find('propiedad[id="{0}"]'.format(propertyName.substring(propertyName.indexOf('P') + 1, propertyName.length)));

                        var propertyNode = $('<propiedad />', xml);
                        //var atributosHijo = propiedad.atributos;
                        var llaveHijo = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'llave'").Select("$.valor").FirstOrDefault();
                        var ordenHijo = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'Orden'").Select("$.valor").FirstOrDefault();
                        var separaMilesHijo = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'SeparaMiles'").Select("$.valor").FirstOrDefault();
                        var otrosEstimulosHijo = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'TieneOtrosEstimulos'").Select("$.valor").FirstOrDefault();
                        var compensacionesHijo = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'TieneCompensaciones'").Select("$.valor").FirstOrDefault();
                        var compensacionTabHijo = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'EsCompensacionTabulada'").Select("$.valor").FirstOrDefault();
                        var fechaIsoHijo = Enumerable.From(propiedad.atributos.atributo).Where("$.nombre == 'EsFechaISO'").Select("$.valor").FirstOrDefault();

                        propertyNode.attr('id', idPropiedad);
                        propertyNode.attr('claveinformativa', propiedad.claveInformativa || '');
                        propertyNode.attr('clave', llaveHijo || '');
                        // propertyNode.attr('titulo', propiedad.find('atributo[nombre="TituloCorto"]').attr("valor") || '');
                        propertyNode.attr('orden', ordenHijo || '');
                        propertyNode.attr('separamiles', separaMilesHijo || '');
                        propertyNode.attr('tieneotrosestimulos', otrosEstimulosHijo || '');
                        propertyNode.attr('tienecompensaciones', compensacionesHijo || '');
                        propertyNode.attr('escompensaciontabulada', compensacionTabHijo || '');
                        propertyNode.attr('esfechaiso', fechaIsoHijo || '');

                        for (var checkIndex in viewModelCheckboxList) {
                            var valueCheck = '';
                            if (propertyName === checkIndex) {
                                for (var checkval in viewModelCheckboxList[checkIndex]) {
                                    if (viewModelCheckboxList[checkIndex][checkval] === true) {
                                        valueCheck += checkval + ',';
                                    }
                                }
                                viewModel[entityId][propertyName](valueCheck);
                            }
                        }

                        var valorFlat = viewModel[entityId][propertyName]();
                        var esFecha = /[0-9_]{2}\/[0-9_]{2}\/[0-9_]{4}/igm.test(valorFlat);
                        if (esFecha) {
                            //if (!IsNullOrEmpty(valorFlat) && !isDateEmpty(valorFlat)) {
                            //    var date = FECHA(valorFlat);
                            //    if (date !== fbUtils.getDateMin()) {
                            //        var dateISOString = date.toISOString();
                            //        propertyNode.text(dateISOString);
                            //    }
                            //}
                            propertyNode.text(fbUtils.convertValue(valorFlat, 'Fecha'));
                        } else {
                            if (typeof(valorFlat) === "string") {
                                propertyNode.text(valorFlat.replace(new RegExp(',', 'g'), ''));
                            } else {
                                propertyNode.text(valorFlat);
                            }
                        }

                        entityNode.append(propertyNode);
                    }
                }

                $('modeloDatos', xml).append(entityNode);
            }
        }

        if (!SAT.Environment.settings('isDAS')) {
            var calculodeduccioninversion = $('<calculodeduccioninversion />', xml);
            var calculoamortizacion = $('<calculoamortizacion />', xml);

            calculodeduccioninversion.append(FormsBuilder.Modules.getCalculoInversionesJSONBase64());
            calculoamortizacion.append(FormsBuilder.Calculo.Amortizacion.getJsonBase64());

            $('modeloDatos calculos', xml).append(calculodeduccioninversion).append(calculoamortizacion);
        }

        if (FormsBuilder.XMLForm.getCopyPrecarga() !== undefined) {
            var nodesClabes = FormsBuilder.XMLForm.getCopyPrecarga().find('ClabesBancarias DatosBanco').clone();
            var nodesSubRegimen = FormsBuilder.XMLForm.getCopyPrecarga().find('SubRegimenes Catalogo').clone();
            $('modeloDatos SubRegimenes', xml).append(nodesSubRegimen);
            $('modeloDatos ClabesBancarias', xml).append(nodesClabes);
        } else {
            var nodesSubRegimen = FormsBuilder.XMLForm.getCopyDeclaracion().find('SubRegimenes Catalogo').clone();
            var nodesClabes = FormsBuilder.XMLForm.getCopyDeclaracion().find('ClabesBancarias DatosBanco').clone();
            $('modeloDatos SubRegimenes', xml).append(nodesSubRegimen);
            $('modeloDatos ClabesBancarias', xml).append(nodesClabes);
        }

        var xmlResult = new XMLSerializer().serializeToString(xml.context);
        var encodeXmlResult = Base64.encode(xmlResult);
        $('#DVDECLARACION').html(encodeXmlResult);

        return xmlResult;
    }

    function bindRegresa() {

        var idurl = SAT.Environment.settings('idencriptado');
        window.location.href = '../Clasificador/Index?id=' + idurl

    }

    function bindPresenta() {

        if ($('i.icon-warning-sign').length > 0) {
            $('#modalGuardando').modal('hide');
            openDialogError("Proceso concluído, se detectaron errores en la declaración.");
        }
        else {
            $("[view-model], .sat-container-formgridedicion > button").attr("disabled", "disabled");
            $("#btnPresentarDeclaracion").hide();
            $("#btnRegresarPms.btn.btn-primary.icon").hide();
            $("#btnEnviarDeclara").show();
            $("#btnGuardar").show();
            $("#A38row2").hide();

            $("#btnEnviarDeclara").on('click', bindEnviaDeclara);
        }

    }

    function bindGuardar() {
        $('#modalGuardando').modal('show');
        Service.Test.almacenarDeclaracionTemporalDas(false, "")
    }

    function bindEnviaDeclara() {
        $('#modalGuardando').modal('show');
        var currentPanel = $('.submenu a.active');
        var idPanel = $(currentPanel).attr("idPanel");            

        if (idPanel !== undefined) {
            var seccion = $('#htmlOutput .panel[id="{0}"]'.format(idPanel));
            var idEntidad = $(seccion).attr("identidadpropiedad");
            var formularioGridEdicion = $(".sat-container-formgridedicion[entidad='{0}']".format(idEntidad));

            if (formularioGridEdicion.length > 0) {
                if (FormsBuilder.Modules.getModeGrid() === 'new') {
                    console.log('Cancelo con entidad ', idEntidad);
                    $('.btnCancelFormularioGridEdicionRow').click();
                }
            }
        }
        setTimeout(function () {
            if (FormsBuilder.Utils.hasAllQueueRules() === true ||
                SAT.Environment.settings('isHydrate') === true) {
                console.log('Aun existe reglas en ejecución');
                return;
            }

            setTimeout(function () {
                if (parseInt($('.alertas .number').html()) > 0) {
                    $('#modalErroresEnSecciones').modal('show');
                    return;
                }
                Service.Test.almacenarDeclaracionTemporalDas(true, "/Declaracion/PresentaDeclaracion/")
                //var xml = FormsBuilder.ViewModel.createXml();
                //var encodeXmlResult = Base64.encode(xml);
                //$('#DVDECLARACION').html(encodeXmlResult);

                //var operacion = {
                //    operacion: "OPENVIADOSF",
                //    parametros: {
                //        monto: !SAT.Environment.settings('isDAS') ? $('.topay > span:last').html().substring(1, $('.topay span:last').html().length) : $('#1008017').val(),
                //        revision: false
                //    }
                //};
                //$('#DVOPER').html(JSON.stringify(operacion));
            }, 800);
        }, 800);

    }

})();