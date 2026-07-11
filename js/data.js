/* Knockout Circle — tournament data (illustrative) */
window.KC_DATA = (() => {
  const T = (n, f, rk, cf, ti, co, st, vl, nk, fm, cl) => ({ n, f, rk, cf, ti, co, st, vl, nk, fm, cl });

  const TEAMS = {
    BRA: T('Brazil', '🇧🇷', 5, 'CONMEBOL', 5, 'Dorival Júnior', 'Vinícius Jr.', '€1.18B', 'Seleção', ['W','W','D','W','W'], '#1E9E54'),
    ARG: T('Argentina', '🇦🇷', 1, 'CONMEBOL', 3, 'Lionel Scaloni', 'Lionel Messi', '€910M', 'La Albiceleste', ['W','W','W','D','W'], '#6CACE4'),
    FRA: T('France', '🇫🇷', 2, 'UEFA', 2, 'Didier Deschamps', 'Kylian Mbappé', '€1.12B', 'Les Bleus', ['W','D','W','W','L'], '#2E4BA0'),
    ENG: T('England', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 4, 'UEFA', 1, 'Thomas Tuchel', 'Jude Bellingham', '€1.40B', 'Three Lions', ['W','W','D','W','W'], '#E0202A'),
    ESP: T('Spain', '🇪🇸', 3, 'UEFA', 1, 'Luis de la Fuente', 'Lamine Yamal', '€1.05B', 'La Roja', ['W','W','W','W','D'], '#D4202B'),
    GER: T('Germany', '🇩🇪', 9, 'UEFA', 4, 'Julian Nagelsmann', 'Jamal Musiala', '€1.02B', 'Die Mannschaft', ['W','D','W','L','W'], '#2b2b2b'),
    POR: T('Portugal', '🇵🇹', 6, 'UEFA', 0, 'Roberto Martínez', 'Cristiano Ronaldo', '€1.10B', 'Seleção das Quinas', ['W','W','W','W','W'], '#C8102E'),
    NED: T('Netherlands', '🇳🇱', 7, 'UEFA', 0, 'Ronald Koeman', 'Virgil van Dijk', '€800M', 'Oranje', ['W','D','W','L','W'], '#EA6C1E'),
    BEL: T('Belgium', '🇧🇪', 8, 'UEFA', 0, 'Domenico Tedesco', 'Kevin De Bruyne', '€700M', 'Red Devils', ['L','W','D','W','W'], '#E30613'),
    CRO: T('Croatia', '🇭🇷', 10, 'UEFA', 0, 'Zlatko Dalić', 'Luka Modrić', '€450M', 'Vatreni', ['W','D','D','W','L'], '#D6202B'),
    ITA: T('Italy', '🇮🇹', 11, 'UEFA', 4, 'Luciano Spalletti', 'Nicolò Barella', '€700M', 'Azzurri', ['W','W','D','W','W'], '#1F50A0'),
    URU: T('Uruguay', '🇺🇾', 12, 'CONMEBOL', 2, 'Marcelo Bielsa', 'Federico Valverde', '€560M', 'La Celeste', ['W','L','W','W','D'], '#5BA3DA'),
    USA: T('USA', '🇺🇸', 13, 'CONCACAF', 0, 'Mauricio Pochettino', 'Christian Pulisic', '€350M', 'USMNT', ['W','W','L','D','W'], '#1A3A6B'),
    MEX: T('Mexico', '🇲🇽', 14, 'CONCACAF', 0, 'Javier Aguirre', 'Raúl Jiménez', '€300M', 'El Tri', ['W','D','W','W','L'], '#11703A'),
    JPN: T('Japan', '🇯🇵', 15, 'AFC', 0, 'Hajime Moriyasu', 'Takefusa Kubo', '€285M', 'Samurai Blue', ['W','W','W','D','W'], '#1B2A6B'),
    KOR: T('South Korea', '🇰🇷', 16, 'AFC', 0, 'Hong Myung-bo', 'Son Heung-min', '€225M', 'Taegeuk Warriors', ['D','W','L','W','W'], '#C8102E'),
    SEN: T('Senegal', '🇸🇳', 17, 'CAF', 0, 'Aliou Cissé', 'Sadio Mané', '€300M', 'Lions of Teranga', ['W','W','D','L','W'], '#1E9E54'),
    MAR: T('Morocco', '🇲🇦', 18, 'CAF', 0, 'Walid Regragui', 'Achraf Hakimi', '€320M', 'Atlas Lions', ['W','W','W','D','W'], '#C1272D'),
    SUI: T('Switzerland', '🇨🇭', 19, 'UEFA', 0, 'Murat Yakin', 'Granit Xhaka', '€280M', 'Nati', ['D','W','L','W','D'], '#D52B1E'),
    DEN: T('Denmark', '🇩🇰', 20, 'UEFA', 0, 'Brian Riemer', 'Rasmus Højlund', '€350M', 'Danish Dynamite', ['W','D','W','L','W'], '#C60C30'),
    COL: T('Colombia', '🇨🇴', 21, 'CONMEBOL', 0, 'Néstor Lorenzo', 'Luis Díaz', '€330M', 'Los Cafeteros', ['W','W','D','W','W'], '#FCD116'),
    ECU: T('Ecuador', '🇪🇨', 22, 'CONMEBOL', 0, 'Sebastián Beccacece', 'Moisés Caicedo', '€290M', 'La Tri', ['D','W','W','L','D'], '#FFCE00'),
    AUS: T('Australia', '🇦🇺', 23, 'AFC', 0, 'Tony Popovic', 'Jackson Irvine', '€90M', 'Socceroos', ['W','L','D','W','W'], '#00843D'),
    CAN: T('Canada', '🇨🇦', 24, 'CONCACAF', 0, 'Jesse Marsch', 'Alphonso Davies', '€180M', 'Les Rouges', ['W','W','L','D','W'], '#D52B1E'),
    SWE: T('Sweden', '🇸🇪', 25, 'UEFA', 0, 'Jon Dahl Tomasson', 'Alexander Isak', '€280M', 'Blågult', ['W','D','L','W','W'], '#1B5DAD'),
    POL: T('Poland', '🇵🇱', 26, 'UEFA', 0, 'Michał Probierz', 'Robert Lewandowski', '€230M', 'Biało-czerwoni', ['L','W','W','D','W'], '#DC143C'),
    GHA: T('Ghana', '🇬🇭', 27, 'CAF', 0, 'Otto Addo', 'Mohammed Kudus', '€150M', 'Black Stars', ['W','L','W','D','W'], '#006B3F'),
    NGA: T('Nigeria', '🇳🇬', 28, 'CAF', 0, 'Éric Chelle', 'Victor Osimhen', '€260M', 'Super Eagles', ['W','D','W','W','L'], '#008751'),
    CMR: T('Cameroon', '🇨🇲', 29, 'CAF', 0, 'Marc Brys', 'André Onana', '€155M', 'Indomitable Lions', ['D','W','L','W','D'], '#0E7C5A'),
    NOR: T('Norway', '🇳🇴', 30, 'UEFA', 0, 'Ståle Solbakken', 'Erling Haaland', '€420M', 'Løvene', ['W','W','W','D','W'], '#BA0C2F'),
    SRB: T('Serbia', '🇷🇸', 31, 'UEFA', 0, 'Dragan Stojković', 'Dušan Vlahović', '€280M', 'Orlovi', ['W','L','D','W','W'], '#C6363C'),
    CIV: T('Ivory Coast', '🇨🇮', 32, 'CAF', 0, 'Emerse Faé', 'Sébastien Haller', '€165M', 'Les Éléphants', ['D','W','W','L','D'], '#FF8200'),
    ALG: T('Algeria', '🇩🇿', 36, 'CAF', 0, 'Vladimir Petković', 'Riyad Mahrez', '€180M', 'Les Fennecs', ['W','D','W','W','L'], '#1c7a4c'),
    AUT: T('Austria', '🇦🇹', 23, 'UEFA', 0, 'Ralf Rangnick', 'David Alaba', '€310M', 'Das Team', ['W','W','D','W','L'], '#C8102E'),
    BIH: T('Bosnia & Herzegovina', '🇧🇦', 62, 'UEFA', 0, 'Sergej Barbarez', 'Edin Džeko', '€120M', 'Zmajevi', ['W','L','W','D','W'], '#1B3F8F'),
    CPV: T('Cape Verde', '🇨🇻', 68, 'CAF', 0, 'Bubista', 'Ryan Mendes', '€40M', 'Tubarões Azuis', ['W','D','L','W','W'], '#1B4FA0'),
    COD: T('DR Congo', '🇨🇩', 56, 'CAF', 0, 'Sébastien Desabre', 'Yoane Wissa', '€130M', 'Léopards', ['W','W','D','L','W'], '#1E63C4'),
    EGY: T('Egypt', '🇪🇬', 34, 'CAF', 0, 'Hossam Hassan', 'Mohamed Salah', '€210M', 'The Pharaohs', ['W','D','W','W','D'], '#C8102E'),
    PAR: T('Paraguay', '🇵🇾', 39, 'CONMEBOL', 0, 'Gustavo Alfaro', 'Miguel Almirón', '€110M', 'La Albirroja', ['D','W','W','L','W'], '#CE1126'),
    RSA: T('South Africa', '🇿🇦', 59, 'CAF', 0, 'Hugo Broos', 'Ronwen Williams', '€60M', 'Bafana Bafana', ['W','W','L','D','W'], '#007A4D'),
  };

  const ORDER = ['BRA','SRB','FRA','CIV','ENG','GHA','ESP','NOR','NED','ECU','POR','CMR','GER','AUS','BEL','CAN','ARG','NGA','URU','POL','CRO','JPN','MAR','SUI','USA','DEN','MEX','SWE','COL','KOR','SEN','ITA'];

  const PICK = {
    'r32-0':'BRA','r32-1':'FRA','r32-2':'ENG','r32-3':'ESP','r32-4':'NED','r32-5':'POR','r32-6':'GER','r32-7':'BEL',
    'r32-8':'ARG','r32-9':'URU','r32-10':'CRO','r32-11':'MAR','r32-12':'USA','r32-13':'MEX','r32-14':'COL','r32-15':'ITA',
    'r16-0':'BRA','r16-1':'ESP','r16-2':'POR','r16-3':'GER','r16-4':'ARG','r16-5':'CRO','r16-6':'MEX','r16-7':'ITA',
    'qf-0':'ESP','qf-1':'POR',
  };

  const LIVE = { 'qf-2': { min: 73 }, 'qf-3': { min: 61 } };

  const SP = (rank, flag, name, handle, val, verified) => ({ rank, flag, name, handle, val, verified });
  const STAT_TABS = [['goals','Goals'],['assists','Assists'],['owngoals','Own Goals'],['red','Red Cards'],['yellow','Yellow Cards']];
  const STATS = {
    goals: [SP(1,'🇦🇷','Lionel Messi','@leomessi',6,true),SP(2,'🇫🇷','Ousmane Dembélé','@dembouz',4,true),SP(2,'🇫🇷','Kylian Mbappé','@kmbappe',4,true),SP(2,'🇳🇴','Erling Haaland','@erlinghaaland',4,true),SP(2,'🇧🇷','Vinícius Júnior','@vinijr',4,true),SP(6,'🏴󠁧󠁢󠁥󠁮󠁧󠁿','Harry Kane','@hkane',3,true),SP(6,'🇩🇪','Deniz Undav',null,3,false),SP(6,'🇨🇩','Yoane Wissa',null,3,false),SP(6,'🇸🇳','Ismaïla Sarr','@izosarr',3,false),SP(6,'🇧🇷','Matheus Cunha','@mathcunha20',3,false),SP(6,'🇨🇦','Jonathan David','@itsjodavid',3,true),SP(6,'🇲🇦','Ismael Saibari',null,3,false),SP(6,'🇨🇭','Johan Manzambi',null,3,false),SP(6,'🇳🇱','Brian Brobbey',null,3,false)],
    assists: [SP(1,'🇧🇪','Kevin De Bruyne','@debruynekev',5,true),SP(2,'🇦🇷','Lionel Messi','@leomessi',4,true),SP(2,'🏴󠁧󠁢󠁥󠁮󠁧󠁿','Jude Bellingham','@bellingham',4,true),SP(2,'🇭🇷','Luka Modrić',null,4,false),SP(5,'🇪🇸','Lamine Yamal','@lamineyamal',3,true),SP(5,'🇲🇦','Achraf Hakimi','@achrafhakimi',3,true),SP(5,'🇨🇦','Alphonso Davies','@adavies19',3,true),SP(5,'🇺🇸','Christian Pulisic','@cpulisic',3,true),SP(5,'🇰🇷','Son Heung-min','@sonny7',3,true),SP(5,'🇯🇵','Takefusa Kubo',null,3,false),SP(5,'🇧🇷','Raphinha','@raphinha',3,true)],
    owngoals: [SP(1,'🇦🇺','Harry Souttar',null,1,false),SP(1,'🇷🇸','Nikola Milenković',null,1,false),SP(1,'🇨🇮','Willy Boly',null,1,false),SP(1,'🇪🇨','Piero Hincapié',null,1,false),SP(1,'🇵🇱','Jan Bednarek',null,1,false),SP(1,'🇩🇰','Andreas Christensen',null,1,false)],
    red: [SP(1,'🇺🇾','José Giménez',null,1,false),SP(1,'🇲🇽','Edson Álvarez',null,1,false),SP(1,'🇨🇲','André Onana',null,1,false),SP(1,'🇬🇭','Mohammed Salisu',null,1,false),SP(1,'🇸🇪','Emil Krafth',null,1,false),SP(1,'🇪🇨','Moisés Caicedo',null,1,false),SP(1,'🇳🇬','Wilfred Ndidi',null,1,false)],
    yellow: [SP(1,'🇦🇷','Rodrigo De Paul',null,3,false),SP(1,'🇭🇷','Marcelo Brozović',null,3,false),SP(3,'🇲🇦','Sofyan Amrabat',null,2,false),SP(3,'🇮🇹','Nicolò Barella',null,2,false),SP(3,'🇧🇷','Casemiro','@casemiro',2,true),SP(3,'🇵🇹','João Palhinha',null,2,false),SP(3,'🇪🇸','Rodri',null,2,false),SP(3,'🇺🇸','Tyler Adams',null,2,false),SP(3,'🇩🇪','Joshua Kimmich',null,2,false)],
  };

  const NW = (cat, title, time, posts, emoji, bg, lede) => ({ cat, title, time, posts, emoji, bg, lede });
  const NEWS = [
    NW('TRENDING','Arsenal stars carry club form into the World Cup knockouts','19m',245,'⚽','#1d6f42','A cluster of Premier League players have carried their form into the knockout rounds, with England, Brazil, Belgium, Norway and Sweden all leaning on club teammates to go deep.'),
    NW('MATCH','Fans criticise hydration breaks during the Brazil knockout win','1h',92,'🇧🇷','#0c5c2e','Supporters questioned the timing of cooling breaks during a sweltering afternoon kick-off, reigniting a wider conversation about player welfare in summer tournaments.'),
    NW('DEBATE','Online debate erupts over scheduling and revenue at the 2026 finals','1h',93,'🏟️','#3a2d6b','With matches spread across three host nations and record broadcast deals in place, commentators are split on whether the expanded format serves fans or the bottom line.'),
    NW('OPINION','Backlash builds over claims the World Cup does not belong in North America','2h',103,'🏆','#7a5b16','A viral post arguing the tournament should be held elsewhere drew a wave of responses from supporters on both sides of the Atlantic.'),
    NW('AROUND SPORT','Wimbledon begins amid overlap with the World Cup quarter-finals','3h',42,'🎾','#2f5d2a','The grass-court major gets under way this week, leaving fans juggling two marquee events and broadcasters competing for prime-time attention.'),
    NW('SOCIAL','Supporters split over who to back in a blockbuster quarter-final','3h',998,'🔥','#7a2424','A heavyweight last-eight tie has fans picking sides, with old rivalries and breakout stars fuelling the debate across timelines.'),
    NW('TRAVEL','International visitors share warm impressions of host cities','5h',37,'✈️','#1f4b7a','Early arrivals report smooth travel, lively fan zones and a warm welcome across host cities, pushing back on pre-tournament concerns.'),
  ];

  const ROUNDS = [
    { key: 'r32', name: 'Round of 32', short: 'R32', count: 16, R: 0.355 },
    { key: 'r16', name: 'Round of 16', short: 'R16', count: 8, R: 0.262 },
    { key: 'qf', name: 'Quarter-final', short: 'QF', count: 4, R: 0.172 },
    { key: 'sf', name: 'Semi-final', short: 'SF', count: 2, R: 0.088 },
    { key: 'final', name: 'Final', short: 'F', count: 1, R: 0.0 },
  ];

  return { TEAMS, ORDER, PICK, LIVE, STATS, STAT_TABS, NEWS, ROUNDS, TEAM_R: 0.455, UNIT: 360 / 32 };
})();
