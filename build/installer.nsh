; Al desinstalar, quita la clave de la extensión .dgusx si quedó vacía
; (electron-builder elimina el tipo de archivo pero deja la extensión).
!macro customUnInstall
  DeleteRegKey /ifempty HKCU "Software\Classes\.dgusx"
!macroend
