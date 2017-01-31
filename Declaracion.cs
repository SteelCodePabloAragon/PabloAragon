//@(#)DECLARACIONESANUALES(W:#####:Sat.DeclaracionesAnuales.Portal.Negocio.Declaraciones:Sat.DeclaracionesAnuales.Portal.Negocio.Declaraciones.Declaracion:1:dd/mm/yyyy[Assembly:1.0:dd/mm/yyyy])

namespace Sat.DeclaracionesAnuales.Portal.Negocio.Declaraciones
{
    using Sat.DeclaracionesAnuales.Entidad.Extension;
    using AccesoDatos.Manejador.Configuracion;
    using DyP.Clasificador.Entidades.Azure;
    using DyP.Clasificador.Negocio;
    using DyP.Herramientas.Entidad.Azure;
    using Sat.DeclaracionesAnuales.AccesoDatos.Manejador.Procesamiento;
    using Sat.DeclaracionesAnuales.AccesoDatos.Manejador.Reportes;
    using Sat.DeclaracionesAnuales.Cache;
    using Sat.DeclaracionesAnuales.Entidad.Azure;
    using Sat.DeclaracionesAnuales.Entidad.Consulta;
    using Sat.DeclaracionesAnuales.Entidad.Enumeracion;
    using Sat.DyP.Herramientas.Configuracion;
    using Sat.DyP.Herramientas.Diagnostico;
    using Sat.DyP.Herramientas.Logger;
    using SAT.DeclaracionesAnuales.Portal.Negocio.Descargas;
    using System;
    using System.Collections.Generic;
    using System.IO;
    using System.Linq;
    using System.Net;
    using System.Threading.Tasks;
    using System.Xml.Linq;
    using System.Xml.XPath;
    using Validacion;
    using Logger = Sat.DyP.Herramientas.Logger;

    /// <summary>
    /// Clase para el manejo de la declaración
    /// </summary>
    public class Declaracion : IDisposable
    {

        #region Métodos Plantillas

        public delegate dynamic Portal(string r, string e, string p, string d);
        public Portal obtieneTotales;

        public List<string> ObtenerPlantillaObligaciones(dynamic parametro, out string formulario, out int codigoRespuesta)
        {
            List<string> plantillas = new List<string>();
            string[] xmlPlantillas = null;
            string xmlDeclaracionTemporal = string.Empty;
            string xmlDeclaracionVigente = string.Empty;
            codigoRespuesta = (int)CodigoRespuestaGeneral.OK;
            string forma ="new";
            string mensaje = string.Empty;

            try
            {
                string rfc = parametro.Rfc;
                long idDeclaracion = parametro.NoDeclaracion ?? 0;
                string xmlTemporal = string.Empty;
                var obligaciones = new List<string>();

                if (idDeclaracion > 0)
                {
                    AdministradorDeclaracionClasificador administrador = new AdministradorDeclaracionClasificador();
                    DeclaracionClasificador declaraClasificador = administrador.ObtenerDeclaracionPorDypLlave(parametro.Rfc.ToString(), idDeclaracion.ToString()); 

                    if(declaraClasificador != null)
                    {
                        parametro.DeclaracionClasificador = declaraClasificador.Consecutivo;
                    }
                    else
                    {
                        parametro.DeclaracionClasificador = 1;
                        Exception ex = new Exception($"No encontro declaracion clasificardor:  {parametro.Rfc} - {idDeclaracion}");
                        RegistroEvento.Error(ref ex, CodigoEvento.ErrorInfraestrucura, GetType().Name);
                    }
                }

                #region Obtenemos la informacion del contribuyente, ya sea por Precarga, Selector, Temporal                        
                var plantillaData = new Descarga.Entities.PrecargaContribuyente()
                {
                    rfc = parametro.Rfc,
                    ejercicio = parametro.ejercicio != null ? Convert.ToString(parametro.ejercicio) : null,
                    periodo = parametro.periodo != null ? parametro.periodo : null,
                    tipoContribuyente = parametro.TipoContribuyente,
                    metodoAutenticacion = parametro.MetodoAutenticacion,
                    declaracionID = idDeclaracion,
                    reformaID = parametro.NoReforma != null ? parametro.NoReforma : null,
                    alscEmpleado = parametro.idAlscEmpleado,
                    rfcEmpleado = parametro.rfcEmpleado,
                    presentaDeclaracion = parametro.presentaDeclaracion ?? false,
                    OpcionCalculoISR = parametro.OpcionCalculoISR ?? "-1",
                    consecutivo = parametro.DeclaracionClasificador.ToString(),
                    MuestraCalculoISR = parametro.muestraOCISR.ToString()
                };

                using (var prec = new Descarga.PreCarga())
                {
                    prec.DeclaracionDatos += (s, m, u) =>
                    {
                        try { return Consultas.Consulta.InfoDeclaracion(s, m, u); }
                        catch (Exception ex)
                        {
                            RegistraEvento.Instancia.EscribeEvento(ex);
                            RegistroEvento.Error(ref ex, CodigoEvento.ErrorInfraestrucura, GetType().Name);
                            return null;

                        }
                    };

                    prec.ejecutaAccion += (p, a) =>
                    {
                        switch (a)
                        {
                            case Descarga.PreCarga.accion.Totales:
                                if (obtieneTotales != null)
                                {
                                    return obtieneTotales(p[0], p[1], p[2], p[3]);
                                }
                                break;
                            case Descarga.PreCarga.accion.Plantillas:
                                for (int i = 4; i <= p.Length - 1; i++) obligaciones.Add(p[i]/*.Replace("0145", "ISR").Replace("0309", "IVA")*/);
                                xmlPlantillas = ServicioObtienePlantillas(p[1], p[2], p[3] ?? parametro.periodicidad.ToString(), obligaciones.ToArray());
                                break;
                            case Descarga.PreCarga.accion.Complementaria:
                                Dictionary<string, string> listaConceptos = new Dictionary<string, string>();
                                foreach (string c in p[3].Split('|').Where(d => !string.IsNullOrEmpty(d)))
                                {
                                    listaConceptos.Add(c.Split(',')[0], c.Split(',')[1]);
                                }

                                xmlDeclaracionVigente = RecuperarXmlConceptos(listaConceptos, p[0]);
                                break;
                            case Descarga.PreCarga.accion.Temporal:
                                if (RecuperaEntidadDeclaracionTemporal(p[0], p[3]) != null)
                                {
                                    xmlTemporal = RecuperarXmlDeclaracionTemporal(p[0], p[3]);
                                }

                                if (!string.IsNullOrEmpty(xmlTemporal))
                                {
                                    forma = "tmp";
                                }
                                break;
                        }

                        return null;
                    };

                    try
                    {

                        mensaje = prec.ObtenerDatosContribuyente(plantillaData, out codigoRespuesta);
                    }
                    catch (Exception ex)
                    {

                        RegistraEvento.Instancia.EscribeEvento(ex);
                        RegistroEvento.Error(ref ex, CodigoEvento.ErrorInfraestrucura, GetType().Name);
                    }
                }

                #endregion

                formulario = forma;
                plantillas.Add(mensaje);
                plantillas.Add(xmlTemporal);
                plantillas.Add(xmlDeclaracionVigente);
                if (xmlPlantillas != null)
                {
                    plantillas.AddRange(xmlPlantillas);
                }
                else
                {
                    plantillas.AddRange(new string[6]);
                }

                plantillas.Add(obligaciones.Count(o => o == TipoObligacion.ISR.ToDescription()).ToString().ToLower());
            }
            catch (Exception ex)
            {
                RegistraEvento.Instancia.EscribeEvento(ex);
                RegistroEvento.Error(ref ex, CodigoEvento.ErrorInfraestrucura, GetType().Name);
                throw ex;
            }

            return plantillas;

        }

        string[] ServicioObtienePlantillas(string ejercicio, string periodo, string periodicidad, string[] obligaciones)
        {
            try
            {
                var servicioPlantillaClient = new SAT.DeclaracionesAnuales.Portal.Negocio.ContenedorPlantillas.ServicioPlantillaClient();

                ServicePointManager.ServerCertificateValidationCallback = (snder, cert, chain, error) => true;

                return servicioPlantillaClient.ObtenerPlantillaDyP(
                    ConfiguracionApp.AdaptadorCloud.RecuperarString("IdAplicacionPlantillas"),
                    ejercicio,
                    periodo,
                    periodicidad,
                    obligaciones,
                    "1");
            }
            catch(Exception e) { return new string[6]; }
        }

        #endregion

        #region Métodos Declaración Temporal


        /// <summary>
        /// Almacena una declaración temporal en el Blob
        /// </summary>
        /// <param name="declaracionBase64">Archivo en base 64 de la declaración</param>
        /// <param name="rfc">Rfc del contribuyente</param>
        /// <param name="regimen">Regimen a presentar</param>
        /// <param name="ejercicio">Identificador del ejercicio</param>
        /// <param name="periodo">Identificador del periodo</param>
        /// <param name="periododescripcion">Descripción del periodo</param>
        /// <param name="tipoDeclaracion">Tipo de declaración presentada</param>
        /// <param name="tipoDeclaracionDescripcion">Descripción de la declaración</param>
        /// <param name="tipoComplementaria">Tipo de complemetaria</param>
        /// <param name="tipoComplementariaDescripcion">Decripción del tipo de complementaria</param>
        /// <param name="tipoPersona">Tipo de persona F o M</param>
        /// <param name="subregimen">Identificadores de subregimen separados con "," </param>
        /// <param name="areageografica">Identificador del area geografica</param>
        /// <param name="sinCalculo">Bandera que indica si se implementara calculo automatico</param>
        /// <returns>Uri del Blob</returns>
        public string AlmacenarDeclaracionTemporal(string declaracionBase64, string rfcContribuyente, string idDeclaracion, int ejercicio,
             string periodo, string periodoDescripcion, string periodicidad, string periodicidadDescripcion,
             string tipoDeclaracion, string tipoDeclaracionDescripcion, string tipoComplementaria, string tipoComplementariaDescripcion, string NoReforma,
              bool contieneErrores = false)
        {
            string uriBlob = string.Empty;
            try
            {
                RegistroEvento.Informacion(String.Format("Inicia AlmacenarDeclaracionTemporal con los sigs datos, rfc {0}, idDeclaracion {1}, ejercicio {2}, tipo decla {3}",
                    rfcContribuyente, idDeclaracion, ejercicio, tipoDeclaracion), CodigoEvento.InformacionNegocio, String.Empty, "Declaracion");

                string declaracion = Utileria.Instancia.DeCodificarBase64(declaracionBase64);
                using (var administrador = new AdministradorDeclaracion())
                {
                    
                    uriBlob = administrador.AlmacenarDeclaracionTemporal(declaracion, rfcContribuyente, idDeclaracion, ejercicio,
                        periodo, periodoDescripcion, periodicidad, periodicidadDescripcion,
                       tipoDeclaracion, tipoDeclaracionDescripcion, tipoComplementaria, tipoComplementariaDescripcion, NoReforma, contieneErrores);
                }

                RegistroEvento.Informacion(String.Format("Termino sin Error AlmacenarDeclaracionTemporal con los sigs datos, rfc {0}, idDeclaracion {1}, ejercicio {2}, tipo decla {3}",
                    rfcContribuyente, idDeclaracion, ejercicio, tipoDeclaracion), CodigoEvento.InformacionNegocio, String.Empty, "Declaracion");

            }
            catch (Exception ex)
            {
                RegistraEvento.Instancia.EscribeEvento(ex);
                RegistroEvento.Error(ref ex, CodigoEvento.ErrorInfraestrucura, GetType().Name);
                throw ex;
            }
            return uriBlob;
        }

        /// <summary>
        ///  Recupera Xml de la declaración temporal del contribuyente en Base 64
        /// </summary>
        /// <param name="rfc">Rfc del contribuyente</param>
        /// <param name="regimen">Identificador del regimen o formato</param>
        /// <param name="ejercicio">Identificador del ejercicio</param>
        /// <returns>Archivo xml de la declaración en Base64</returns>
        public string RecuperarXmlDeclaracionTemporal(string rfc, string idDeclaracion, bool codificada = true)
        {
            string xml = string.Empty;
            try
            {
                string mensaje = string.Format("Solicitud de declaración temporal. Rfc {0}. IdDeclaracion {1}. ", rfc, idDeclaracion);
                Logger.RegistroEvento.Informacion(mensaje, CodigoEvento.InformacionDatos, GetType().Name, string.Empty);

                // Obtenemos el xml del modelo de datos temporal
                Stream streamModeloDatos = null;
                using (var administrador = new AdministradorDeclaracion())
                {
                    var configuracionSAS = CacheConfiguracion.Instancia.RecuperarConfiguracionSAS();
                    streamModeloDatos = administrador.RecuperaXmlTemporal(rfc, idDeclaracion, configuracionSAS);
                }
                if (streamModeloDatos != null)
                {
                    streamModeloDatos.Seek(0, SeekOrigin.Begin);
                    XDocument document = XDocument.Load(streamModeloDatos);
                    
                    var fechaActualizada = document.XPathSelectElement("//*[local-name()='modeloDatos']/*[local-name()='entidad' and @tipo='SAT_DATOS_GENERALES']/*[local-name()='propiedad' and @claveinformativa='38']");
                    if (fechaActualizada != null)
                    {
                        fechaActualizada.Value = ConfiguracionApp.AdaptadorCloud.RecuperarFechaSinHoraISO();
                    }
                    if (codificada)
                        xml = Utileria.Instancia.CodificarBase64(document.ToString());
                    else
                        xml = document.ToString();
                }
                else
                {
                    string mensajeError = string.Format("Declaración temporal vacía o no se encuentra. Rfc {0}. IdDeclaracion {1}.", rfc, idDeclaracion);
                    throw new Exception("Se generó un error al obtener la declaración temporal: " + mensajeError);
                }
            }
            catch (Exception ex)
            {
                Logger.RegistroEvento.Error(ref ex, CodigoEvento.ErrorDatos, GetType().Name,
                                            rfc: rfc, regimen: idDeclaracion);
                throw new Exception("Se generó un error al obtener la declaración temporal. Inténtelo más tarde.", ex);
            }
            return xml;
        }

        public DeclaracionTemporal RecuperaEntidadDeclaracionTemporal(string rfc, string idDeclaracion) {
            DeclaracionTemporal declaracionTemporal = null;
            try
            {
               
                using (var administrador = new AdministradorDeclaracion())
                {
                    declaracionTemporal = administrador.RecuperaEntidadDeclaracionTemporal(rfc, idDeclaracion);
                }
            }
            catch (Exception ex)
            {
                RegistraEvento.Instancia.EscribeEvento(ex);
            }
            return declaracionTemporal;
        }

        public List<DeclaracionTemporal> RecuperaEntidadDeclaracionTemporal(string rfc)
        {
           List< DeclaracionTemporal> declaracionTemporal = null;
            try
            {

                using (var administrador = new AdministradorDeclaracion())
                {
                    declaracionTemporal = administrador.RecuperaEntidadDeclaracionTemporal(rfc);
                }
            }
            catch (Exception ex)
            {
                RegistraEvento.Instancia.EscribeEvento(ex);
            }
            return declaracionTemporal;
        }

        /// <summary>
        /// Elimina la declaración temporal del contribuyente
        /// </summary>
        /// <param name="rfc">Rfc del contribuyente</param>
        /// <param name="regimen">Identificador del regimen o formato</param>
        /// <param name="ejercicio">Identificador del ejercicio</param>
        public bool EliminarDeclaracionTemporal(string rfc, string idDeclaracion)
        {
            bool eliminado = true;
            try
            {
                
                using (var administrador = new AdministradorDeclaracion())
                {

                    DeclaracionTemporal declaracionTemporal = administrador.RecuperaEntidadDeclaracionTemporal(rfc, idDeclaracion);
                    if (declaracionTemporal != null)
                    {
                        administrador.EliminarArchivoBlob(declaracionTemporal.BlobUri);
                        administrador.EliminarDeclaracionTemporal(declaracionTemporal);
                        // Verificamos que realmente se borro la temporal
                        eliminado = administrador.RecuperaEntidadDeclaracionTemporal(rfc, idDeclaracion) != null ? false : true;
                    }
                }
            }
            catch (Exception ex)
            {
                RegistraEvento.Instancia.EscribeEvento(ex);               
            }
            return eliminado;
        }

        #endregion

        #region ***** Métodos Declaración Provisional *****

        public string AlmacenarDeclaracionProvisional(DeclaracionProvisional pro, string xmlDeclaracion, string xmlSatMessage, string pdfBase64, string htmlBase64)
        {
            string uriBlob = string.Empty;
            try
            {
                RegistroEvento.Informacion(String.Format("Inicia AlmacenarDeclaracionProvisional con los sigs datos, rfc {0}, idDeclaracion {1}, ejercicio {2}, tipo decla {3}",
                    pro.rfc, pro.idDeclaracion, pro.ejercicio, pro.tipoDeclaracion), CodigoEvento.InformacionNegocio, String.Empty, "Declaracion");

                
                using (var administrador = new AdministradorDeclaracion())
                {
                    uriBlob=administrador.RecibeDeclaracionDyp(pro, xmlDeclaracion, xmlSatMessage, pdfBase64, htmlBase64);
                }

                RegistroEvento.Informacion(String.Format("Termino sin Error AlmacenarDeclaracionProvisional con los sigs datos, rfc {0}, idDeclaracion {1}, ejercicio {2}, tipo decla {3}",
                    pro.rfc, pro.idDeclaracion, pro.ejercicio, pro.tipoDeclaracion), CodigoEvento.InformacionNegocio, String.Empty, "Declaracion");

            }
            catch (Exception ex)
            {
                RegistraEvento.Instancia.EscribeEvento(ex);
                RegistroEvento.Error(ref ex, CodigoEvento.ErrorInfraestrucura, GetType().Name);
                throw ex;
            }
            return uriBlob;
        }

        public string RecuperarXmlProvisonal(string rfc, string idDeclaracion, bool codificada = true)
        {
            string xml = string.Empty;
            try
            {
                string mensaje = string.Format("Solicitud de recupera declaración. Rfc {0}. IdDeclaracion {1}. ", rfc, idDeclaracion);
                Logger.RegistroEvento.Informacion(mensaje, CodigoEvento.InformacionDatos, GetType().Name, string.Empty);

                // Obtenemos el xml del modelo de datos temporal
                Stream streamModeloDatos = null;
                using (var administrador = new AdministradorDeclaracion())
                {
                    streamModeloDatos = administrador.RecuperarXmlProvisonal(rfc, idDeclaracion);                    
                }
                if (streamModeloDatos != null)
                {
                    streamModeloDatos.Seek(0, SeekOrigin.Begin);
                    XDocument document = XDocument.Load(streamModeloDatos);                    
                    if (codificada)
                        xml = Utileria.Instancia.CodificarBase64(document.ToString());
                    else
                        xml = document.ToString();
                }
                else
                {
                    string mensajeError = string.Format("Declaración temporal vacía o no se encuentra. Rfc {0}. IdDeclaracion {1}.", rfc, idDeclaracion);
                    throw new Exception("Se generó un error al obtener la declaración temporal: " + mensajeError);
                }
            }
            catch (Exception ex)
            {
                Logger.RegistroEvento.Error(ref ex, CodigoEvento.ErrorDatos, GetType().Name,
                                            rfc: rfc, regimen: idDeclaracion);
                throw new Exception("Se generó un error al obtener la declaración temporal. Inténtelo más tarde.", ex);
            }
            return xml;
        }

        string CreaXMLUnicoProvisional(List<string> lprov)
        {
            var xdoc = new XElement("modeloDatos");

            lprov.ForEach(xml => {
                var document = XDocument.Parse(xml);
                var conceptos = document.XPathSelectElements("//*[local-name()='modeloDatos']/*[local-name()='entidad' and @claveimpuesto!='']");
                xdoc.Add(conceptos);
            });

            return Utileria.Instancia.CodificarBase64(xdoc.ToString());
        }
        public string RecuperarXmlConceptos(Dictionary<string, string> listaDeclaraciones, string rfc, bool codificada = true)
        {
            XDocument xmlDocumento = XDocument.Parse("<modeloDatos/>");
            string xmlRetorno = string.Empty;
            try
            {
                Parallel.ForEach(listaDeclaraciones.Keys, (valueListaConceptos) =>
                {
                    string xml = string.Empty;
                    string concepto = valueListaConceptos;
                    string idDeclaracion = listaDeclaraciones[valueListaConceptos];

                    string mensaje = string.Format("Solicitud de recupera declaración. Rfc {0}. IdDeclaracion {1} Concepto {2}. ", rfc, idDeclaracion, concepto);
                    Logger.RegistroEvento.Informacion(mensaje, CodigoEvento.InformacionDatos, GetType().Name, string.Empty);

                    // Obtenemos el xml del modelo de datos temporal
                    Stream streamModeloDatos = null;
                    using (var administrador = new AdministradorDeclaracion())
                    {
                        streamModeloDatos = administrador.RecuperarXmlConcepto(rfc, idDeclaracion, concepto);
                    }
                    if (streamModeloDatos != null)
                    {
                        streamModeloDatos.Seek(0, SeekOrigin.Begin);
                        XDocument xdDeclaracion = XDocument.Load(streamModeloDatos);
                        var nodosEntidad = xdDeclaracion.Root.Elements("entidad").ToList();
                        xmlDocumento.Root.Add(nodosEntidad);
                        //var nodosAgrupados = xdDeclaracion.Root.Elements("entidad").Where(x => x.Attribute("claveimpuesto") != null).ToList();
                    }
                    else
                    {
                        string mensajeError = string.Format("Declaración temporal vacía o no se encuentra. Rfc {0}. IdDeclaracion {1}.", rfc, idDeclaracion);
                        throw new Exception("Se generó un error al obtener la declaración temporal: " + mensajeError);
                    }
                });


            }
            catch (Exception ex)
            {
                Logger.RegistroEvento.Error(ref ex, CodigoEvento.ErrorDatos, GetType().Name,
                                            rfc: rfc);
                throw new Exception("Se generó un error al obtener la declaración por conceptos. Inténtelo más tarde.", ex);
            }

            if (codificada)
                xmlRetorno = Utileria.Instancia.CodificarBase64(xmlDocumento.ToString());
            else
                xmlRetorno = xmlDocumento.ToString();

            return xmlRetorno;
        }

        #endregion ***** Métodos Declaración Provisional *****

        #region Metodos para el envio de la declaracion

        public string RecibeDeclaracion(string rfc, string idDeclaracion, out string mensajeError)
        {
            string uriBlob = string.Empty;

            DeclaracionTemporal temporal= this.RecuperaEntidadDeclaracionTemporal(rfc, idDeclaracion);
            if (temporal != null)
            {
                string xmlDeclaracion = this.RecuperarXmlDeclaracionTemporal(rfc, idDeclaracion, false);
                uriBlob = preparaDeclaracionProvisional(xmlDeclaracion, rfc, idDeclaracion, temporal, out mensajeError);
            }
            else
            {
                mensajeError = "No existe la declaracion temporal";                
            }

            return uriBlob;
        }

        public byte[] RecuperaPDF(string uriBlob)
        {
            byte[] archivoDeBytes = null;
            try
            {
                if (!string.IsNullOrEmpty(uriBlob))
                {
                    using (var administradorConfiguracion = new AdministradorConfiguracion())
                    {
                        Stream stream = administradorConfiguracion.RecuperarArchivoBlob(uriBlob);
                        if (stream != null)
                        {
                            stream.Seek(0, SeekOrigin.Begin);                            
                                // El stream ya contiene el pdf
                                using (MemoryStream memStream = new MemoryStream())
                                {
                                    stream.CopyTo(memStream);
                                    archivoDeBytes = memStream.ToArray();
                                }                                                       
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                RegistraEvento.Instancia.EscribeEvento(ex);
                RegistroEvento.Error(ref ex, CodigoEvento.ErrorInfraestrucura, GetType().Name);
                throw ex;
            }
            return archivoDeBytes;
        }

        public string ObtenerCadenaOriginal(string rfc, string idDeclaracion)
        {
            string cadenaOriginalBase64 = string.Empty;
            try
            {
                // Obtenemos la declaración temporal
                string declaracion = RecuperarXmlDeclaracionTemporal(rfc, idDeclaracion, false);
                // Obtenemos la cadena original
                string cadenaOriginal = Sellado.Herramienta.CadenaOriginal.Instancia.ObtenCadenaOriginal(declaracion, TipoCadenaOriginal.FirmaCliente);
                cadenaOriginalBase64 = Utileria.Instancia.CodificarBase64(cadenaOriginal);
            }
            catch (Exception ex)
            {
                RegistraEvento.Instancia.EscribeEvento(ex);
                RegistroEvento.Error(ref ex, CodigoEvento.ErrorInfraestrucura, GetType().Name);
                throw ex;

            }
            return cadenaOriginalBase64;
        }

        public string RecibeDeclaracionFirmada(DyP.Herramientas.Entidad.Declaracion.ReciboDeclaracionFirmada rdf, out string mensajeRespuesta)
        {
            string uriBlob = string.Empty;
            mensajeRespuesta = string.Empty;
            try
            {
                DeclaracionTemporal temporal = this.RecuperaEntidadDeclaracionTemporal(rdf.rfc, rdf.idDeclaracion);
                if (temporal != null)
                {
                    string declaracion = RecuperarXmlDeclaracionTemporal(rdf.rfc, rdf.idDeclaracion, false);
                    string xmlDeclaracion = agregaValoresDeclaracion(declaracion, true, rdf.numeroCertificado, "", rdf.firma, rdf.folioFirmado);

                    uriBlob = preparaDeclaracionProvisional(xmlDeclaracion, rdf.rfc, rdf.idDeclaracion, temporal, out mensajeRespuesta);
                }
                else
                {
                    mensajeRespuesta = "No existe la declaracion temporal";
                }
            }
            catch (Exception ex)
            {
                RegistraEvento.Instancia.EscribeEvento(ex);
                RegistroEvento.Error(ref ex, CodigoEvento.ErrorInfraestrucura, GetType().Name);
                throw ex;

            }
            return uriBlob;
        }

        string preparaDeclaracionProvisional(string xmlDeclaracion, string rfc, string idDeclaracion, DeclaracionTemporal temporal, out string mensaje)
        {
            string uriBlob = string.Empty;
            mensaje = string.Empty;

            try
            {
                TransformadorSATMessage procesaMensaje = new TransformadorSATMessage();
                RespuestaServicioDyP respuestaProceso = procesaMensaje.EnviarMensajeSAT(xmlDeclaracion,idDeclaracion,rfc);

                if (respuestaProceso.Procesado)
                {
                    if (string.IsNullOrEmpty(new DeterminacionPagoDyP().ConsultarOpcPagoISREnClasificador(temporal.Ejercicio, rfc)))
                    {
                        /*Apartado para determinar si el contribuyente seleccionó ingreso menos gasto o coeficiente de utilidad en el formulario de ISR*/
                        try
                        {
                            XDocument xdocTmp = XDocument.Parse(xmlDeclaracion);
                            var nodoISR = xdocTmp.XPathSelectElement("//*[local-name()='modeloDatos']/*[local-name()='entidad' and @tipo='SAT_DETERMINACION_IMPUESTO' and @claveimpuesto='" + TipoObligacion.ISR.ToDescription() + "']/*[local-name()='propiedad' and @claveinformativa='OCISR']");
                            if (nodoISR != null)
                            {
                                string misr = nodoISR.Value == "1" ? "CU" : "IG";
                                var pago = new DeterminacionPagoDyP();
                                pago.AgregarOpcPagoISR(temporal.Ejercicio, rfc, misr);
                                pago.MarcarComoCerrada(temporal.Ejercicio, rfc);
                            }
                        }
                        catch (Exception _ex)
                        {
                            RegistraEvento.Instancia.EscribeEvento(_ex);
                            RegistroEvento.Error(ref _ex, CodigoEvento.ErrorDatos, GetType().Name);
                        }
                    }

                    uriBlob = respuestaProceso.PDF;

                    var declaraProvisional = new DeclaracionProvisional
                    {
                        rfc = rfc,
                        ejercicio = temporal.Ejercicio,
                        idDeclaracion = idDeclaracion,
                        NoReforma = temporal.VersionReforma,
                        periodicidad = temporal.Periodicidad,
                        periodicidadDescripcion = temporal.PeriodicidadDescripcion,
                        periodo = temporal.Periodo,
                        tipoDeclaracion = temporal.TipoDeclaracion,
                        tipoDeclaracionDescripcion = temporal.TipoDeclaracionDescripcion,
                        periodoDescripcion = temporal.PeriodoDescripcion,
                        tipoComplementaria = temporal.TipoComplementaria,
                        tipoComplementariaDescripcion = temporal.TipoComplementariaDescripcion,
                    };

                    uriBlob = AlmacenarDeclaracionProvisional(declaraProvisional, xmlDeclaracion, respuestaProceso.XmlMessage, respuestaProceso.PDF, respuestaProceso.HTML);

                    EliminarDeclaracionTemporal(rfc, idDeclaracion);

                    using (AdministradorEnvioDeclaracionConceptos administrador = new AdministradorEnvioDeclaracionConceptos())
                    {
                        try
                        {
                            administrador.EnviarMensaje(rfc, idDeclaracion);
                        }
                        catch (Exception ex)
                        {
                            RegistroEvento.Error(ref ex, CodigoEvento.ErrorNegocio, "Generacion del mensaje de recepción de declaracion.");
                        }
                    }


                    try
                    {
                        using (var administrador = new AdministradorDeclaracionClasificador())
                        {
                            //var declaracionClasificador = administrador.ObtenerDeclaracionPorDypLlave(rfc, idDeclaracion);
                            //declaracionClasificador.EstadoActual = (int)Sat.DyP.Clasificador.Entidades.Enumeraciones.EstadoDeclaracion.Enviada;
                            //administrador.AgregarActualizarDeclaracion(declaracionClasificador);
                            //
                            var declaracionAlmacenada = DeclaracionClasificadorComplementos.MarcarComoDeclaracionEnviada(rfc, idDeclaracion, temporal.VersionReforma);
                            if (declaracionAlmacenada != null)
                            {
                                administrador.EncolarCfdisReportes(declaracionAlmacenada.RowKey);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        RegistroEvento.Error(ref ex, CodigoEvento.ErrorNegocio, "Marcar como enviada y crear petición para worker de datos.");
                    }
                }
                else
                {

                    mensaje = respuestaProceso.Mensaje + respuestaProceso.PDF;
                }
            }
            catch(Exception ex) { throw ex; }
            return uriBlob;
        }

        public long obtieneMontoDevolucion(string rfc, string idDeclaracion, out string mensajeError)
        {
            mensajeError = string.Empty;
            long devolucion = 0;
            try
            {
                if (RecuperaEntidadDeclaracionTemporal(rfc, idDeclaracion) != null)
                {
                    var xmlTemporal = RecuperarXmlDeclaracionTemporal(rfc, idDeclaracion, false);
                    XDocument doc = XDocument.Parse(xmlTemporal);
                    XElement nodoDevolucion = doc.XPathSelectElement(
                        "//*[local-name()='modeloDatos']/*[local-name()='entidad' and @tipo='SAT_DETERMINACION_IMPUESTO' and @claveimpuesto='" + TipoObligacion.IVA.ToDescription() + "']/*[local-name()='propiedad' and @claveinformativa='220720']");
                    if(nodoDevolucion != null && !string.IsNullOrEmpty(nodoDevolucion.Value))
                    {
                        devolucion = long.Parse(nodoDevolucion.Value);
                    }
                    else
                    {
                        mensajeError = "No se obtuvo el monto de la devolución.";
                    }
                }
                else
                {
                    mensajeError = "No se obtuvo el monto de la devolución.";
                }
            }
            catch (Exception ex)
            {
                mensajeError = "No se obtuvo el monto de la devolución.";
                throw ex;
            }
            return devolucion;
        }

        #endregion

        #region Métodos privados
        /// <summary>
        /// Método que agrega valores fijos a la declaración
        /// </summary>
        /// <param name="xml">Xml de la declaración</param>
        /// <param name="declaracionAnual">Clase de la declaración</param>
        /// <param name="tipoDocumento">Tipo de documento</param>
        /// <returns></returns>
        private XDocument AgregarInformacion(XDocument xml, DeclaracionAnual declaracionAnual, TipoDocumento tipoDocumento)
        {
            if (tipoDocumento == TipoDocumento.CopiaDeclaracionesPagadas || tipoDocumento == TipoDocumento.DeclaracionesPagadas)
            {
                var nodoPago = new XElement("entidad");
                nodoPago.Add(new XAttribute("id", "PGOBCOREC"));
                nodoPago.Add(new XAttribute("titulo", "Información Pago"));
                nodoPago.Add(new XAttribute("titulolargo", "Información del Pago Recibido en la Institución de Crédito Autorizada"));
                nodoPago.Add(new XAttribute("tipo", "SAT_PAGO_BANCO"));
                nodoPago.Add(new XAttribute("clave", "SAT_PGO_BAN"));

                using (var accesoDatos = new AdministradorMonitor())
                {
                    var secuencia = 1;
                    var listaPagos = accesoDatos.RecuperaInfoLineasCapturaPagadas(declaracionAnual.NumeroOperacion);
                    foreach (ConsultaLineaPagada pago in listaPagos)
                    {

                        var nodoFila = new XElement("fila");
                        nodoFila.Add(new XAttribute("orden", 1));
                        nodoFila.Add(new XAttribute("identificador", secuencia));

                        var nodoInstitucionCrediticia = new XElement("propiedad");
                        nodoInstitucionCrediticia.Add(new XAttribute("id", "PGO001"));
                        nodoInstitucionCrediticia.Add(new XAttribute("titulo", "Institución de Crédito"));
                        nodoInstitucionCrediticia.Add(new XAttribute("clave", "SAT_INT_CTO"));
                        nodoInstitucionCrediticia.Add(new XAttribute("claveinformativa", "PGO001"));
                        nodoInstitucionCrediticia.SetValue(pago.NombreInstitucionCrediticia);
                        nodoFila.Add(nodoInstitucionCrediticia);

                        var nodoLineaCaptura = new XElement("propiedad");
                        nodoLineaCaptura.Add(new XAttribute("id", "PGO002"));
                        nodoLineaCaptura.Add(new XAttribute("titulo", "Linea de Captura"));
                        nodoLineaCaptura.Add(new XAttribute("clave", "SAT_LC"));
                        nodoLineaCaptura.Add(new XAttribute("claveinformativa", "PGO002"));
                        nodoLineaCaptura.SetValue(pago.LineaCaptura);
                        nodoFila.Add(nodoLineaCaptura);

                        var nodoImporte = new XElement("propiedad");
                        nodoImporte.Add(new XAttribute("id", "PGO003"));
                        nodoImporte.Add(new XAttribute("titulo", "Importe Pagado"));
                        nodoImporte.Add(new XAttribute("clave", "SAT_IMP_PGO"));
                        nodoImporte.Add(new XAttribute("claveinformativa", "PGO003"));
                        nodoImporte.SetValue(pago.ImportePagado);
                        nodoFila.Add(nodoImporte);

                        var nodoFechaPago = new XElement("propiedad");
                        nodoFechaPago.Add(new XAttribute("id", "PGO004"));
                        nodoFechaPago.Add(new XAttribute("titulo", "Fecha del Pago"));
                        nodoFechaPago.Add(new XAttribute("clave", "SAT_FEC_PGO"));
                        nodoFechaPago.Add(new XAttribute("claveinformativa", "PGO004"));
                        nodoFechaPago.SetValue(pago.FechaPago.ToString("yyyy-MM-ddTHH:mm:ssZ"));
                        nodoFila.Add(nodoFechaPago);

                        var nodoMedioPresentacion = new XElement("propiedad");
                        nodoMedioPresentacion.Add(new XAttribute("id", "PGO005"));
                        nodoMedioPresentacion.Add(new XAttribute("titulo", "Medio de Presentación"));
                        nodoMedioPresentacion.Add(new XAttribute("clave", "SAT_MED_PRC"));
                        nodoMedioPresentacion.Add(new XAttribute("claveinformativa", "PGO005"));
                        nodoMedioPresentacion.SetValue(pago.MedioPresentacion);
                        nodoFila.Add(nodoMedioPresentacion);

                        var nodoNumeroOperacion = new XElement("propiedad");
                        nodoNumeroOperacion.Add(new XAttribute("id", "PGO006"));
                        nodoNumeroOperacion.Add(new XAttribute("titulo", "Número de Operación"));
                        nodoNumeroOperacion.Add(new XAttribute("clave", "SAT_OP_BCO"));
                        nodoNumeroOperacion.Add(new XAttribute("claveinformativa", "PGO006"));
                        nodoNumeroOperacion.SetValue(pago.NumeroOperacion);
                        nodoFila.Add(nodoNumeroOperacion);

                        var nodoNumeroLlavePago = new XElement("propiedad");
                        nodoNumeroLlavePago.Add(new XAttribute("id", "PGO007"));
                        nodoNumeroLlavePago.Add(new XAttribute("titulo", "Llave de Pago"));
                        nodoNumeroLlavePago.Add(new XAttribute("clave", "SAT_LL_PGO"));
                        nodoNumeroLlavePago.Add(new XAttribute("claveinformativa", "PGO007"));
                        nodoNumeroLlavePago.SetValue(String.IsNullOrEmpty(pago.LlavePago) ? string.Empty : pago.LlavePago);
                        nodoFila.Add(nodoNumeroLlavePago);

                        secuencia++;
                        nodoPago.Add(nodoFila);
                    }
                }

                xml.Root.Add(nodoPago);
            }

            return xml;
        }

        
        private TipoCadenaOriginal RecuperarTipoSellado(TipoDocumento tipoDocumento)
        {
            switch (tipoDocumento)
            {
                case TipoDocumento.CopiaCertificada:
                    return TipoCadenaOriginal.SelloCopiaCertificada;
                case TipoDocumento.CopiaDeclaracionesPagadas:
                    return TipoCadenaOriginal.SelloCopiaDeclaracionesPagadas;
            }

            throw new NotImplementedException();
        }




        /// <summary>
        /// Agregamos valores fijos a la declaración
        /// </summary>
        /// <param name="declaracion">Declaración</param>
        /// <param name="conFirma">Variable si la declaración viene firmada</param>
        /// <param name="numeroCertificado">Numero de certificado</param>
        /// <param name="certificado">Certificado</param>
        /// <param name="firma">Firma</param>
        /// <returns>Declaración con los valores agregados</returns>
        private string agregaValoresDeclaracion(string declaracion, bool conFirma, string numeroCertificado = "", string certificado = "", string firma = "", string folioFirmado = "")
        {
            XDocument doc = XDocument.Parse(declaracion);

            string rfcTermina, alscTermina;
            rfcTermina = alscTermina = string.Empty;
            try
            {
                XElement entidad = doc.XPathSelectElement("//*[local-name()='modeloDatos']/*[local-name()='entidad' and @tipo='SAT_DATOS_GENERALES']");

                if (conFirma)
                {
                    Dictionary<string, string> atributosFirma = new Dictionary<string, string>() {
                    { "43", "true"},
                    { "44", numeroCertificado },
                    { "48", certificado },
                    { "49", firma }
                    };


                    foreach (var dic in atributosFirma)
                    {
                        var propiedad = (from p in entidad.Elements()
                                         where (string)p.Attribute("id") == dic.Key
                                         select p
                                         ).SingleOrDefault();

                        propiedad.Value = dic.Value ?? "";
                    }

                }
            }
            catch (Exception ex)
            {
                RegistraEvento.Instancia.EscribeEvento(ex);
                RegistroEvento.Error(ref ex, CodigoEvento.ErrorInfraestrucura, GetType().Name);
                throw ex;
            }

            return doc.ToString();
        }




        #endregion

        #region Implementación Dispose
        private bool _isDisposed;
        public void Dispose()
        {
            if (_isDisposed)
            {
                return;
            }
            _isDisposed = true;
            GC.SuppressFinalize(this);
        }
        #endregion
    }
}
