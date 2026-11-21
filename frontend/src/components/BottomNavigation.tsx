import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type MainTab = 'deudas' | 'registros' | 'pasanaku' | 'perfil';

const items = [
  { key: 'deudas', label: 'Mis deudas', icon: 'book-open-outline' },
  { key: 'registros', label: 'Registros', icon: 'plus-box-outline' },
  { key: 'pasanaku', label: 'Pasanaku', icon: 'account-group-outline' },
  { key: 'perfil', label: 'Perfil', icon: 'account-circle-outline' },
] as const;

type Props = { selected: MainTab; onSelect: (tab: MainTab) => void };

export function BottomNavigation({ selected, onSelect }: Props) {
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {items.map(item => {
        const isSelected = selected === item.key;
        const color = isSelected ? styles.selected.color : styles.inactive.color;
        return (
          <TouchableOpacity
            key={item.key}
            style={styles.item}
            onPress={() => onSelect(item.key)}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: isSelected }}
          >
            <MaterialCommunityIcons name={item.icon} size={23} color={color} />
            <Text numberOfLines={1} style={[styles.label, isSelected ? styles.selected : styles.inactive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#DCE7E2',
    paddingHorizontal: 5,
    paddingTop: 5,
    paddingBottom: 3,
  },
  item: { flex: 1, minWidth: 0, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10, fontWeight: '700' },
  selected: { color: '#138879' },
  inactive: { color: '#71817B' },
});
