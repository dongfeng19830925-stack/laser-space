if(new URLSearchParams(location.search).has('monitor'))await import('./monitor-window.js');
else await import('./simulation.js');
