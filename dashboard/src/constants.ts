export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export const MESES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Abreviaturas de estados para etiquetas compactas (p. ej. "Ecatepec de Morelos, Méx.").
// Incluye las variantes de nombre largo/corto; si un estado no aparece, se usa el nombre completo.
export const ENTIDAD_ABREV: Record<string, string> = {
  'Aguascalientes': 'Ags.',
  'Baja California': 'BC',
  'Baja California Sur': 'BCS',
  'Campeche': 'Camp.',
  'Coahuila de Zaragoza': 'Coah.',
  'Coahuila': 'Coah.',
  'Colima': 'Col.',
  'Chiapas': 'Chis.',
  'Chihuahua': 'Chih.',
  'Ciudad de México': 'CDMX',
  'Durango': 'Dgo.',
  'Guanajuato': 'Gto.',
  'Guerrero': 'Gro.',
  'Hidalgo': 'Hgo.',
  'Jalisco': 'Jal.',
  'México': 'Méx.',
  'Estado de México': 'Méx.',
  'Michoacán de Ocampo': 'Mich.',
  'Michoacán': 'Mich.',
  'Morelos': 'Mor.',
  'Nayarit': 'Nay.',
  'Nuevo León': 'NL',
  'Oaxaca': 'Oax.',
  'Puebla': 'Pue.',
  'Querétaro': 'Qro.',
  'Quintana Roo': 'Q. Roo',
  'San Luis Potosí': 'SLP',
  'Sinaloa': 'Sin.',
  'Sonora': 'Son.',
  'Tabasco': 'Tab.',
  'Tamaulipas': 'Tamps.',
  'Tlaxcala': 'Tlax.',
  'Veracruz de Ignacio de la Llave': 'Ver.',
  'Veracruz': 'Ver.',
  'Yucatán': 'Yuc.',
  'Zacatecas': 'Zac.',
}
